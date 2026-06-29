import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, AlertController } from '@ionic/angular';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Package } from '../services/mock-db.service';
import { ScanningApisService } from '../services/scanning-apis.service';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Camera } from '@capacitor/camera';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
// navigator.vibrate() used for haptics — built into Android WebView, no extra package needed
import { getTracking, findTracking, ups, usps, fedex, dhl, amazon, ontrac, s10 } from 'ts-tracking-number';
import { firstValueFrom } from 'rxjs';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Carrier {
  carrierName: string;
  regexPattern?: RegExp;
  type?: any;
  validityType?: 'auto' | 'custom';
  considerDigits?: number;
}

export interface BatchItem {
  id?: number;
  trackingNumber: string;
  carrier: string;
  status: 'normal' | 'missing' | 'refund' | 'rejected';
  labelPhoto: string;
  isSync?: boolean;
  scannedAt?: number;
}

export interface Receipt {
  serial: string;
  totalCount: number;
  locationId: string;
  locationName: string;
  operator: string;
  timestamp: Date;
  partner: string;
  items: BatchItem[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-scanning',
  templateUrl: 'scanning.page.html',
  styleUrls: ['scanning.page.scss'],
  standalone: false
})
export class ScanningPage implements OnInit {

  user: User | null = null;

  /** Wizard steps */
  step: 'partner' | 'scan' | 'review' | 'receipt' = 'partner';

  selectedPartner: string = '';
  selectedCarrierObj: Carrier | null = null;
  isImageProcessing: boolean = false;

  // Camera elements
  @ViewChild('video', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvas', { static: true }) canvasElement!: ElementRef<HTMLCanvasElement>;
  cameraStream: MediaStream | null = null;

  // Scanner box coords (CSS px)
  scannerX = 20;
  scannerY = 150;
  scannerWidth = 320;
  scannerHeight = 200;

  // Batch state
  batchItems: BatchItem[] = [];
  selectedPackageForDetail: BatchItem | null = null;

  // API sync
  groupReceivedOrderId: number | null = null;
  syncingWorker: any = null;

  // Receipt
  completedReceipt: Receipt | null = null;
  isSubmittingBatch: boolean = false;

  // Partner search
  partnerSearchQuery: string = '';
  recentPartners: string[] = ['FedEx', 'UPS', 'Amazon', 'DHL', 'USPS', 'DHL Express'];

  allPartners: Carrier[] = [
    { carrierName: 'Fedex',   regexPattern: /^(?:\d{12}|\d{15}|\d{20}|CC\d{8,10}|DT\d{12})$/,                                                               type: fedex,   validityType: 'auto',   considerDigits: -12 },
    { carrierName: 'USPS',    regexPattern: /^(?:\d{20}|\d{22}|\d{26}|\d{30}|\d{34}|[A-Z]{2}\d{9}[A-Z]{2})$/,                                               type: usps,    validityType: 'auto',   considerDigits: 0 },
    { carrierName: 'UPS',     regexPattern: /^(?:1Z[0-9A-Z]{16}|\d{9}|\d{12}|\d{15})$/,                                                                      type: ups,     validityType: 'auto',   considerDigits: 0 },
    { carrierName: 'Amazon',  regexPattern: /^(?:TBA|TBM|TBC)\d{9,12}|[A-Z]{2}\d{9}CN$/,                                                                     type: amazon,  validityType: 'auto',   considerDigits: 0 },
    { carrierName: 'DHL',     regexPattern: /\b(?:\d{10}|\d{11}|\d{12}|\d{13}|\d{14}|\d{15}|\d{20}|[A-Z]{2}\d{9}[A-Z]{2}|\d{3}-\d{4}-\d{4})\b/,            type: dhl,     validityType: 'auto',   considerDigits: 0 },
    { carrierName: 'Ontrac',  regexPattern: /\b(?:\d{10}|\d{11}|\d{12}|\d{13}|\d{14}|\d{15}|\d{20}|[A-Z]{2}\d{9}[A-Z]{2}|\d{3}-\d{4}-\d{4})\b/,            type: ontrac,  validityType: 'auto',   considerDigits: 0 },
    { carrierName: 's10',     regexPattern: /^[a-z0-9]{16}$/,                                                                                                  type: s10,     validityType: 'auto',   considerDigits: 0 },
    { carrierName: 'Wallmart',   regexPattern: /\b200\d{12}\b/,                                         validityType: 'custom', considerDigits: 0 },
    { carrierName: 'Lasership',  regexPattern: /(?<=^|\s)((?:1LS|LS|LX|BN)\S+)/,                       validityType: 'custom', considerDigits: 0 },
    { carrierName: 'Target',     regexPattern: /(?<=Tracking\s*#:\s*)[A-Za-z0-9]+/,                    validityType: 'custom', considerDigits: 0 },
    { carrierName: 'Roadie',     regexPattern: /\b(?:\d{10}|\d{11}|\d{12}|\d{13}|\d{14}|\d{15}|\d{20}|[A-Z]{2}\d{9}[A-Z]{2}|\d{3}-\d{4}-\d{4})\b/, validityType: 'custom', considerDigits: 0 },
    { carrierName: 'Other',      regexPattern: /^.+$/,                                                  validityType: 'custom', considerDigits: 0 }
  ];

  // Camera internals
  cameraInterval: any = null;   // kept for stopCamera compat (clearInterval)
  loopActive: boolean = false;  // controls the async scan while-loop
  videoDevices: MediaDeviceInfo[] = [];
  currentDeviceIndex: number = 0;

  // Performance guards
  consecutiveMisses: number = 0;      // suppress toast spam on misses
  torchOn: boolean = false;           // flashlight state

  // Debug log
  debugLogs: string[] = [];
  showDebugPanel: boolean = false;

  constructor(
    public auth: AuthService,
    private db: MockDbService,
    private scanningApiService: ScanningApisService,
    private router: Router,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.auth.currentUser$.subscribe(u => { this.user = u; });

    App.addListener('appStateChange', (state: any) => {
      if (!state.isActive) {
        this.stopCamera();
      } else if (this.step === 'scan') {
        this.startCamera();
      }
    });
  }

  ionViewWillEnter() {
    this.log('ionViewWillEnter() step=' + this.step);
    this.restoreBatchState();
    if (this.step === 'scan') {
      this.activateCameraMode();
    }
  }

  ionViewWillLeave() {
    this.log('ionViewWillLeave()');
    this.stopCamera();
    this.deactivateCameraMode();
  }

  // ─── Camera mode helpers ──────────────────────────────────────────────────

  activateCameraMode() {
    this.log('activateCameraMode()');
    document.body.classList.add('camera-active');
    const tabBar = document.querySelector('ion-tab-bar');
    if (tabBar) (tabBar as HTMLElement).style.setProperty('display', 'none', 'important');
    const navPill = document.querySelector('.liquid-nav-pill');
    if (navPill) (navPill as HTMLElement).style.setProperty('display', 'none', 'important');
    const actionCircle = document.querySelector('.liquid-action-circle');
    if (actionCircle) (actionCircle as HTMLElement).style.setProperty('display', 'none', 'important');

    // Center scanner box on current screen dimensions
    this.centerScannerBox();
    this.consecutiveMisses = 0;
    this.torchOn = false;

    this.cdr.detectChanges();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.log('rAF: escape stacking context + startCamera()');

      // Move camera-page to document.body so it escapes Ionic's nested
      // stacking contexts (APP-SCANNING z:101 → ION-ROUTER-OUTLET z:0).
      // Angular's ngIf EmbeddedViewRef still tracks and destroys the node
      // correctly regardless of its position in the DOM tree.
      const cameraPage = document.querySelector('.camera-page') as HTMLElement;
      if (cameraPage && cameraPage.parentElement !== document.body) {
        this.log('camera-page → body (escape stacking context)');
        document.body.appendChild(cameraPage);
      }

      this.startCamera();
    }));
  }

  deactivateCameraMode() {
    // Move camera-page back into the Angular component tree before ngIf
    // destroys it, so Angular can cleanly remove it.
    const cameraPage = document.querySelector('.camera-page') as HTMLElement;
    if (cameraPage && cameraPage.parentElement === document.body) {
      this.log('camera-page ← returning to ion-content');
      const ionContent = document.querySelector('app-scanning ion-content');
      if (ionContent) {
        ionContent.appendChild(cameraPage);
      }
    }
    document.body.classList.remove('camera-active');
    const tabBar = document.querySelector('ion-tab-bar');
    if (tabBar) (tabBar as HTMLElement).style.removeProperty('display');
    const navPill = document.querySelector('.liquid-nav-pill');
    if (navPill) (navPill as HTMLElement).style.removeProperty('display');
    const actionCircle = document.querySelector('.liquid-action-circle');
    if (actionCircle) (actionCircle as HTMLElement).style.removeProperty('display');
  }

  centerScannerBox() {
    const W = window.innerWidth  || 360;
    const H = window.innerHeight || 800;
    // Wide box — covers most of the screen so labels can be scanned from farther away
    this.scannerWidth  = Math.round(W * 0.88);
    this.scannerHeight = Math.round(H * 0.30);
    this.scannerX      = Math.round((W - this.scannerWidth)  / 2);
    this.scannerY      = Math.round((H - this.scannerHeight) / 2) - 30;
  }

  // ─── Camera ──────────────────────────────────────────────────────────────

  async startCamera() {
    this.log('startCamera()');
    this.log('mediaDevices: ' + !!navigator.mediaDevices);

    // On native Android the WebView never shows the OS permission dialog
    // on its own — we must request it through Capacitor's native layer first.
    if (Capacitor.isNativePlatform()) {
      let granted = false;

      // Primary: @capacitor/camera — most reliable on Android
      try {
        this.log('Requesting camera permission via Camera plugin...');
        const result = await Camera.requestPermissions({ permissions: ['camera'] });
        this.log('Camera plugin permission: ' + result.camera);
        if (result.camera === 'granted' || result.camera === 'limited') {
          granted = true;
        } else if (result.camera === 'denied') {
          this.showToast(
            'Camera permission denied. Go to Settings → Apps → DelCargo → Permissions → Camera.',
            'danger', 7000
          );
          return;
        }
      } catch (e: any) {
        this.log('Camera plugin permission error: ' + e?.message);
      }

      // Fallback: BarcodeScanner plugin
      if (!granted) {
        try {
          this.log('Requesting camera permission via BarcodeScanner...');
          const status = await BarcodeScanner.requestPermissions();
          this.log('BarcodeScanner permission: ' + status.camera);
          if (status.camera === 'denied') {
            this.showToast(
              'Camera permission denied. Go to Settings → Apps → DelCargo → Permissions → Camera.',
              'danger', 7000
            );
            return;
          }
        } catch (e2: any) {
          this.log('BarcodeScanner permission error: ' + e2?.message);
          // Continue anyway — getUserMedia will throw NotAllowedError if truly denied
        }
      }
    }

    try {
      this.videoDevices = [];
      this.currentDeviceIndex = 0;
      await this.initStream();
    } catch (err: any) {
      this.log('startCamera() ERROR: ' + err?.name + ' - ' + err?.message);
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        this.showToast('Camera permission denied. Allow camera in Android settings.', 'danger', 5000);
      } else {
        this.showToast('Could not start camera: ' + (err?.message || 'unknown'), 'danger', 4000);
      }
    }
  }

  async initStream() {
    this.log('initStream()');
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
    }

    // Pick the best rear camera, but ONLY if we can read device labels.
    // Labels are empty until after camera permission is granted.
    // If labels are empty, we fall back to facingMode:'environment' which
    // the browser resolves to the main rear camera automatically.
    if (this.videoDevices.length === 0) {
      try {
        const all  = await navigator.mediaDevices.enumerateDevices();
        const cams = all.filter(d => d.kind === 'videoinput');
        const hasLabels = cams.some(d => d.label.length > 0);

        if (hasLabels) {
          this.log('Camera labels available: ' + cams.map(c => c.label).join(', '));

          // Exclude secondary / damaged lenses (ultrawide, macro, depth, front)
          const excludeKw = ['ultra', 'wide', 'macro', 'depth', 'front', 'user', 'selfie', 'tele'];
          const rearCams = cams.filter(d => {
            const lbl = d.label.toLowerCase();
            return !excludeKw.some(kw => lbl.includes(kw));
          });

          // Prefer explicitly labelled main/back cameras
          const mainCandidates = rearCams.filter(d => {
            const lbl = d.label.toLowerCase();
            return lbl.includes('back') || lbl.includes('rear') ||
                   lbl.includes('environment') || lbl.includes('camera2 0') ||
                   lbl.includes('main');
          });

          const preferred = mainCandidates.length > 0 ? mainCandidates : rearCams;
          if (preferred.length > 0) {
            this.videoDevices      = preferred;
            this.currentDeviceIndex = 0;
            this.log('Selected camera: ' + preferred[0].label);
          } else {
            this.log('No suitable rear camera after filtering — using facingMode:environment');
          }
        } else {
          this.log('No camera labels yet — using facingMode:environment');
        }
      } catch (e) {
        this.log('enumerateDevices error — using facingMode:environment');
      }
    }

    // Request 1080p for detailed label capture; browser picks closest supported
    const videoConstraints: MediaTrackConstraints = this.videoDevices.length > 0
      ? {
          deviceId: { exact: this.videoDevices[this.currentDeviceIndex].deviceId },
          width:  { ideal: 1920 },
          height: { ideal: 1080 }
        }
      : {
          facingMode: 'environment',
          width:  { ideal: 1920 },
          height: { ideal: 1080 }
        };

    const constraints: MediaStreamConstraints = { audio: false, video: videoConstraints };

    this.log('getUserMedia...');
    this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.log('getUserMedia OK - tracks: ' + this.cameraStream.getTracks().length);

    const vid = this.videoElement?.nativeElement;
    this.log('video el: ' + (vid ? 'FOUND' : 'NULL'));
    if (!vid) { this.log('ERROR: video element null'); return; }

    vid.srcObject = this.cameraStream;
    vid.setAttribute('playsinline', 'true');
    vid.setAttribute('webkit-playsinline', 'true');
    vid.muted = true;

    let loopStarted = false;
    const startLoop = () => {
      if (!loopStarted) { loopStarted = true; this.startContinuousScanningLoop(); }
    };

    const playVideo = (reason: string) => {
      this.log('playVideo(' + reason + ') readyState=' + vid.readyState);
      const p = vid.play();
      if (p !== undefined) {
        p.then(() => { this.log('play OK ' + vid.videoWidth + 'x' + vid.videoHeight); startLoop(); })
         .catch((e: any) => {
           this.log('play FAILED: ' + e?.message + ' retrying...');
           setTimeout(() => vid.play().then(() => startLoop()).catch(console.error), 500);
         });
      } else { startLoop(); }
    };

    vid.onloadedmetadata = () => playVideo('loadedmetadata');
    vid.oncanplay       = () => playVideo('canplay');
    setTimeout(() => { if (vid.paused) { this.log('2s fallback'); playVideo('2s-fallback'); } }, 2000);
  }

  async stopCamera() {
    this.log('stopCamera()');
    this.loopActive = false;  // signals the while-loop to exit
    if (this.cameraInterval) { clearInterval(this.cameraInterval); this.cameraInterval = null; }
    if (this.cameraStream)   { this.cameraStream.getTracks().forEach(t => t.stop()); this.cameraStream = null; }
    this.torchOn = false;
    this.consecutiveMisses = 0;
  }

  async switchCamera() {
    try {
      if (this.videoDevices.length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        const backCams = videoInputs.filter(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        if (backCams.length > 0) {
          const main = backCams.filter(d =>
            !d.label.toLowerCase().includes('ultra') &&
            !d.label.toLowerCase().includes('wide') &&
            !d.label.toLowerCase().includes('macro') &&
            !d.label.toLowerCase().includes('depth')
          );
          this.videoDevices = [...main, ...backCams.filter(c => !main.includes(c)), ...videoInputs.filter(v => !backCams.includes(v))];
        } else { this.videoDevices = videoInputs; }
      }
      if (this.videoDevices.length <= 1) { this.showToast('Only one camera detected.', 'warning'); return; }
      this.currentDeviceIndex = (this.currentDeviceIndex + 1) % this.videoDevices.length;
      this.showToast('Switched to: ' + (this.videoDevices[this.currentDeviceIndex].label || 'Camera ' + this.currentDeviceIndex), 'success', 1500);
      await this.initStream();
    } catch (e) {
      console.error('Switch camera failed:', e);
      this.showToast('Could not switch camera.', 'danger');
    }
  }

  startContinuousScanningLoop() {
    this.log('startContinuousScanningLoop()');
    this.loopActive = true;
    this.runScanLoop();   // fire-and-forget async loop
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  private async runScanLoop() {
    let tick = 0;
    while (this.loopActive && this.step === 'scan') {
      tick++;
      const vid = this.videoElement?.nativeElement;
      const playing = vid && !vid.paused && vid.readyState >= 2 && vid.videoWidth > 0;

      if (tick % 10 === 1) {
        this.log(`loop#${tick} playing=${playing} items=${this.batchItems.length}`);
      }

      if (playing && !this.isImageProcessing) {
        // captureFrame returns how long to wait before the next attempt
        const delay = await this.captureFrame();
        await this.sleep(delay);
      } else {
        // Camera not ready yet — poll every 300ms
        await this.sleep(300);
      }
    }
    this.log('scanLoop exited');
  }

  // ─── Frame capture & barcode detection ───────────────────────────────────

  // Returns ms to wait before the next scan. The while-loop in runScanLoop() sleeps for this.
  async captureFrame(): Promise<number> {
    if (this.isImageProcessing) return 200;
    this.isImageProcessing = true;

    let nextDelay = 150; // default: retry quickly on miss

    try {
      // ── Capture the full frame at full resolution ────────────────────────
      // Used for BOTH ML Kit processing AND the stored label photo.
      // Full frame = operator can hold phone farther away and still capture
      // all label details (tracking #, addresses, barcodes, hazmat codes, etc.)
      const fullCanvas  = this.captureFullFrame();
      const fullBase64  = fullCanvas.toDataURL('image/jpeg', 0.92); // high quality
      const base64Only  = fullBase64.replace(/^data:image\/jpeg;base64,/, '');

      let barcodes: string[] = [];

      // ── Step 1: Barcode scan on full frame (fast, low CPU) ───────────────
      if (Capacitor.isNativePlatform()) {
        try {
          const fileUrl = await this.saveBase64ToFile(base64Only);
          barcodes = await this.getVerifiedBarcodes(fileUrl);
        } catch (e: any) {
          if (e?.message?.includes('Carrier mismatch')) throw e;
        }
      }

      // ── Step 2: OCR on full frame — only if barcode scan found nothing ───
      if (barcodes.length === 0) {
        const ocrResult = await this.getTextUsingMLKit(base64Only);
        if (ocrResult?.text) {
          barcodes = await this.getVerifiedBarcodesFromOCR(ocrResult);
        }
      }

      if (barcodes.length > 0) {
        this.consecutiveMisses = 0;

        // Haptic feedback
        try { navigator.vibrate(80); } catch {}

        for (const barcode of barcodes) {
          let cut = this.selectedCarrierObj?.considerDigits ?? barcode.length;
          if (cut === 0) cut = barcode.length;
          const tracking = barcode.slice(cut === barcode.length ? 0 : cut).trim().toUpperCase();
          const isDup = this.batchItems.some(i => i.trackingNumber.toUpperCase() === tracking);

          if (!isDup) {
            this.batchItems.unshift({
              id: this.batchItems.length + 1,
              trackingNumber: tracking,
              carrier: this.selectedPartner,
              status: 'normal',
              labelPhoto: fullBase64, // full-resolution label photo stored here
              isSync: false,
              scannedAt: Date.now()
            });
            this.saveBatchState();
            this.showToast('✓ ' + tracking, 'success', 1000);
            nextDelay = 1500; // pause so operator can move to the next box
          } else {
            this.showToast('Already scanned', 'warning', 1000);
            nextDelay = 800;
          }
        }
      } else {
        this.consecutiveMisses++;
        if (this.consecutiveMisses % 15 === 0) {
          this.showToast('Aim at barcode or label', 'warning', 1000);
        }
        nextDelay = 150;
      }
    } catch (err: any) {
      this.log('captureFrame error: ' + err?.message);
      if (!err?.message?.includes('Carrier mismatch')) {
        this.showToast(err?.message || 'Scan error', 'danger', 1500);
      }
      nextDelay = 600;
    }

    this.isImageProcessing = false;
    return nextDelay;
  }

  captureFullFrame(): HTMLCanvasElement {
    const vid = this.videoElement.nativeElement;
    // Full native resolution — preserves all label detail (address, barcodes,
    // hazmat codes, weight, etc.) that the user may need to review later.
    const c = document.createElement('canvas');
    c.width  = vid.videoWidth  || 1280;
    c.height = vid.videoHeight || 720;
    c.getContext('2d')?.drawImage(vid, 0, 0, c.width, c.height);
    return c;
  }

  captureScannerBox(): HTMLCanvasElement {
    const vid = this.videoElement.nativeElement;
    const sx = vid.videoWidth  / (vid.clientWidth  || 1);
    const sy = vid.videoHeight / (vid.clientHeight || 1);
    const c = document.createElement('canvas');
    c.width  = this.scannerWidth;
    c.height = this.scannerHeight;
    c.getContext('2d')?.drawImage(vid,
      this.scannerX * sx, this.scannerY * sy,
      this.scannerWidth * sx, this.scannerHeight * sy,
      0, 0, this.scannerWidth, this.scannerHeight
    );
    return c;
  }

  async saveBase64ToFile(b64: string): Promise<string> {
    const r = await Filesystem.writeFile({ path: 'barcode-image.png', data: b64, directory: Directory.Cache });
    return r.uri;
  }

  async getVerifiedBarcodes(imgUrl: string): Promise<string[]> {
    let raw: any;
    try {
      raw = await BarcodeScanner.readBarcodesFromImage({
        path: imgUrl,
        formats: [BarcodeFormat.Code128, BarcodeFormat.DataMatrix, BarcodeFormat.QrCode, BarcodeFormat.Code39]
      });
    } catch { return []; }

    const results: string[] = [];
    if (!raw?.barcodes?.length || !this.selectedCarrierObj) return results;

    for (const b of raw.barcodes) {
      const val = b.rawValue;
      if (!val) continue;
      if (this.selectedCarrierObj.type && this.selectedCarrierObj.validityType === 'auto') {
        if (getTracking(val, [this.selectedCarrierObj.type])) { results.push(val); }
        else {
          const other = getTracking(val);
          if (other?.name) throw new Error(`Carrier mismatch: scanned ${other.name}, expected ${this.selectedPartner}`);
        }
      } else if (this.selectedCarrierObj.regexPattern) {
        if (this.selectedCarrierObj.regexPattern.test(val)) { results.push(val); }
        else {
          const other = getTracking(val);
          if (other?.name) throw new Error(`Carrier mismatch: scanned ${other.name}, expected ${this.selectedPartner}`);
        }
      } else { results.push(val); }
      if (results.length > 0) break;
    }
    return results;
  }

  async getTextUsingMLKit(b64: string): Promise<any> {
    try {
      return await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: b64, rotation: 0 });
    } catch { return null; }
  }

  async getVerifiedBarcodesFromOCR(res: any): Promise<string[]> {
    const results: string[] = [];
    if (!res?.text?.length || !this.selectedCarrierObj) return results;

    if (this.selectedCarrierObj.type && this.selectedCarrierObj.validityType === 'auto') {
      let data = findTracking(res.text, [this.selectedCarrierObj.type]);
      if (data?.length) {
        if (this.selectedPartner.toLowerCase() === 'amazon') data = data.filter((i: any) => i.name === 'Amazon Logistics');
        if (this.selectedPartner.toLowerCase() === 'fedex')  data = data.filter((i: any) => i.name === 'FedEx Ground');
        return data.map((i: any) => i.trackingNumber);
      }
      const other = findTracking(res.text);
      if (other?.length) throw new Error(`Carrier mismatch: text matches ${other[0].name}, expected ${this.selectedPartner}`);
    } else if (this.selectedCarrierObj.regexPattern) {
      const m = res.text.match(this.selectedCarrierObj.regexPattern);
      if (m?.length) return [m[0]];
      const other = findTracking(res.text);
      if (other?.length) throw new Error(`Carrier mismatch: text matches ${other[0].name}, expected ${this.selectedPartner}`);
    }
    return results;
  }

  // ─── Batch state ─────────────────────────────────────────────────────────

  saveBatchState() {
    if (this.batchItems.length > 0) {
      localStorage.setItem('delcargo_temp_batch', JSON.stringify({
        step: this.step,
        selectedPartner: this.selectedPartner,
        batchItems: this.batchItems,
        groupReceivedOrderId: this.groupReceivedOrderId
      }));
    } else {
      localStorage.removeItem('delcargo_temp_batch');
    }
  }

  restoreBatchState() {
    const raw = localStorage.getItem('delcargo_temp_batch');
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (s?.batchItems?.length) {
        this.batchItems            = s.batchItems;
        this.selectedPartner       = s.selectedPartner || '';
        this.selectedCarrierObj    = this.allPartners.find(p => p.carrierName.toLowerCase() === this.selectedPartner.toLowerCase()) || null;
        this.groupReceivedOrderId  = s.groupReceivedOrderId || null;
        this.step                  = s.step || 'review';
        this.initiateSyncing();
        if (this.step === 'scan') this.activateCameraMode();
      }
    } catch (e) { console.error('Error restoring batch state', e); }
  }

  // ─── API sync ────────────────────────────────────────────────────────────

  startOcrSyncSession() {
    this.scanningApiService.createGroupReceivedId({ carrier: this.selectedPartner.toLowerCase() }).subscribe((res: any) => {
      if (res.status) {
        this.groupReceivedOrderId = res.data.receivedOrder.id;
        this.initiateSyncing();
        this.saveBatchState();
      } else {
        setTimeout(() => this.startOcrSyncSession(), 3000);
      }
    });
  }

  initiateSyncing() {
    if (this.syncingWorker) clearInterval(this.syncingWorker);
    this.syncingWorker = setInterval(() => this.syncToServer(30), 5000);
  }

  async syncToServer(batch: number) {
    const unsynced = this.batchItems.filter(i => !i.isSync).slice(0, batch);
    if (!unsynced.length || !this.selectedPartner) return;
    unsynced.forEach(i => i.isSync = true);
    const payload = {
      orders: unsynced.map(i => ({
        trackingNumber: i.trackingNumber,
        imgBase64: i.labelPhoto,
        barcodeValue: i.trackingNumber,
        isDamaged: i.status === 'refund',
        isAccepted: i.status !== 'rejected',
        scannedAt: i.scannedAt || Date.now()
      })),
      carrier: this.selectedPartner,
      groupReceivedOrderId: this.groupReceivedOrderId
    };
    try {
      const res: any = await firstValueFrom(this.scanningApiService.syncReceivedOrder(payload));
      if (!res.status) unsynced.forEach(i => i.isSync = false);
      else this.saveBatchState();
    } catch { unsynced.forEach(i => i.isSync = false); }
  }

  // ─── Step navigation ─────────────────────────────────────────────────────

  selectPartner(name: string) {
    this.selectedPartner    = name;
    this.selectedCarrierObj = this.allPartners.find(p => p.carrierName.toLowerCase() === name.toLowerCase()) || null;
    this.step               = 'scan';
    this.startOcrSyncSession();
    this.activateCameraMode();
  }

  async toggleTorch() {
    if (!this.cameraStream) return;
    const track = this.cameraStream.getVideoTracks()[0];
    if (!track) return;
    try {
      this.torchOn = !this.torchOn;
      await (track as any).applyConstraints({ advanced: [{ torch: this.torchOn }] });
      this.log('Torch: ' + (this.torchOn ? 'ON' : 'OFF'));
    } catch {
      this.torchOn = false;
      this.showToast('Torch not supported on this camera', 'warning', 2000);
    }
  }

  async showConfirmDialog(header: string, message: string): Promise<boolean> {
    return new Promise(async resolve => {
      const alert = await this.alertCtrl.create({
        header,
        message,
        buttons: [
          { text: 'Cancel', role: 'cancel', handler: () => resolve(false) },
          { text: 'Leave', role: 'destructive', handler: () => resolve(true) }
        ]
      });
      await alert.present();
    });
  }

  async goBackToPartner() {
    if (this.batchItems.length > 0) {
      const ok = await this.showConfirmDialog(
        'Leave Scanning?',
        `You have ${this.batchItems.length} scanned item${this.batchItems.length !== 1 ? 's' : ''}. Your batch will be saved.`
      );
      if (!ok) return;
    }
    this.stopCamera();
    this.deactivateCameraMode();
    this.step = 'partner';
    this.saveBatchState();
  }

  goToReview() {
    this.stopCamera();
    this.deactivateCameraMode();
    this.step = 'review';
    this.saveBatchState();
  }

  resumeScanning() {
    this.step = 'scan';
    this.activateCameraMode();
  }

  async cancelAndGoHome() {
    if (this.batchItems.length > 0) {
      const ok = await this.showConfirmDialog(
        'Discard Batch?',
        `This will delete ${this.batchItems.length} scanned item${this.batchItems.length !== 1 ? 's' : ''}. Are you sure?`
      );
      if (!ok) return;
    }
    this.stopCamera();
    this.deactivateCameraMode();
    if (this.syncingWorker) { clearInterval(this.syncingWorker); this.syncingWorker = null; }
    this.batchItems = [];
    localStorage.removeItem('delcargo_temp_batch');
    this.router.navigate(['/tabs/dashboard']);
  }

  // ─── Batch actions ────────────────────────────────────────────────────────

  updateItemStatus(item: BatchItem, status: 'normal' | 'missing' | 'refund' | 'rejected') {
    item.status = status;
    this.saveBatchState();
    this.showToast('Status updated: ' + status.toUpperCase(), 'success', 1000);
  }

  togglePackageDetail(item: BatchItem) {
    this.selectedPackageForDetail = this.selectedPackageForDetail === item ? null : item;
  }

  removeScannedItem(index: number) {
    this.batchItems.splice(index, 1);
    this.saveBatchState();
    this.showToast('Package removed.', 'warning');
  }

  finishBatch() {
    if (!this.batchItems.length || !this.user) return;
    this.isSubmittingBatch = true;
    if (this.syncingWorker) { clearInterval(this.syncingWorker); this.syncingWorker = null; }

    const d    = new Date();
    const yy   = d.getFullYear().toString().slice(-2);
    const mm   = ('0' + (d.getMonth() + 1)).slice(-2);
    const dd   = ('0' + d.getDate()).slice(-2);
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    const serial = `REC-${yy}${mm}${dd}-${rand}`;

    let saved = 0;
    this.batchItems.forEach(item => {
      const pkg: Omit<Package, 'id' | 'receivedAt'> = {
        trackingNumber: item.status !== 'normal' ? `${item.trackingNumber} [${item.status.toUpperCase()}]` : item.trackingNumber,
        carrier: item.carrier,
        warehouseId: this.user?.warehouseId || 'W01',
        warehouseName: this.user?.warehouseName || 'Warehouse',
        receivedBy: this.user?.username || 'operator',
        labelPhoto: item.labelPhoto,
        deliveryCountPhotos: []
      };
      this.db.savePackage(pkg).subscribe(() => {
        saved++;
        if (saved === this.batchItems.length) {
          this.completedReceipt = {
            serial,
            totalCount: this.batchItems.length,
            locationId: this.user?.warehouseId || 'N/A',
            locationName: this.user?.warehouseName || 'Warehouse',
            operator: this.user?.username || 'operator',
            timestamp: new Date(),
            partner: this.selectedPartner,
            items: [...this.batchItems]
          };
          this.isSubmittingBatch = false;
          this.batchItems = [];
          localStorage.removeItem('delcargo_temp_batch');
          this.step = 'receipt';
          this.showToast('Receipt ' + serial + ' generated.', 'success');
        }
      });
    });
  }

  startNewBatch() {
    this.step = 'partner';
    this.completedReceipt = null;
    this.selectedPartner = '';
    this.selectedCarrierObj = null;
    this.batchItems = [];
    this.partnerSearchQuery = '';
  }

  goHome() {
    this.router.navigate(['/tabs/dashboard']);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  get filteredPartnersList(): Carrier[] {
    const q = this.partnerSearchQuery.trim().toLowerCase();
    return q ? this.allPartners.filter(p => p.carrierName.toLowerCase().includes(q)) : this.allPartners;
  }

  async showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success', duration = 2000) {
    const t = await this.toastCtrl.create({ message, duration, color, position: 'bottom' });
    t.present();
  }

  log(msg: string) {
    const ts = new Date().toTimeString().slice(0, 8);
    const entry = `[${ts}] ${msg}`;
    console.log(entry);
    this.debugLogs.unshift(entry);
    if (this.debugLogs.length > 40) this.debugLogs.length = 40;
  }
}
