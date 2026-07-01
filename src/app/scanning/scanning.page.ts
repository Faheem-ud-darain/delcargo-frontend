import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController, AlertController } from '@ionic/angular';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Package } from '../services/mock-db.service';
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
  status: 'normal' | 'missing' | 'damaged' | 'rejected';
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
  private audioCtx: AudioContext | null = null;

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
    { carrierName: 'Roadie',     regexPattern: /^[a-zA-Z0-9]{16}$/, validityType: 'custom', considerDigits: 0 },
    { carrierName: 'Other',      regexPattern: /^.+$/,                                                  validityType: 'custom', considerDigits: 0 }
  ];

  // Camera internals
  cameraInterval: any = null;   // kept for stopCamera compat (clearInterval)
  loopActive: boolean = false;  // controls the async scan while-loop
  videoDevices: MediaDeviceInfo[] = [];
  currentDeviceIndex: number = 0;

  // Performance guards
  consecutiveMisses: number = 0;      // suppress toast spam on misses

  // Debug log (console only — no on-screen panel)
  debugLogs: string[] = [];

  // ─── Full-screen photo zoom viewer (pinch / double-tap to zoom) ──────────
  zoomImageUrl: string | null = null;
  viewerScale: number = 1;
  viewerTranslateX: number = 0;
  viewerTranslateY: number = 0;
  viewerTransform: string = 'scale(1) translate(0px, 0px)';
  viewerTransition: string = 'transform 0.15s ease';
  private _vLastTouchDist: number = 0;
  private _vLastTouchX: number = 0;
  private _vLastTouchY: number = 0;
  private _vLastTap: number = 0;
  private _vIsPinching: boolean = false;

  constructor(
    public auth: AuthService,
    private db: MockDbService,
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
      let detectedAngle = 0;

      // ── Step 1: Barcode scan on full frame (fast, low CPU) ───────────────
      if (Capacitor.isNativePlatform()) {
        try {
          const fileUrl = await this.saveBase64ToFile(base64Only);
          
          // Read raw barcodes and extract orientation/validity in one single operation
          const raw = await BarcodeScanner.readBarcodesFromImage({
            path: fileUrl,
            formats: [BarcodeFormat.Code128, BarcodeFormat.DataMatrix, BarcodeFormat.QrCode, BarcodeFormat.Code39]
          });

          if (raw?.barcodes?.length > 0) {
            // Verify if any decoded barcode matches our expected carrier
            const verifiedList: string[] = [];
            let matchFound = false;

            for (const b of raw.barcodes) {
              const val = b.rawValue;
              if (!val) continue;
              const cleanedVal = this.cleanTrackingNumber(val);

              if (this.selectedCarrierObj && this.selectedCarrierObj.type && this.selectedCarrierObj.validityType === 'auto') {
                if (getTracking(cleanedVal, [this.selectedCarrierObj.type])) {
                  verifiedList.push(val);
                  matchFound = true;
                  break;
                }
              } else if (this.selectedCarrierObj && this.selectedCarrierObj.regexPattern) {
                if (this.selectedCarrierObj.regexPattern.test(cleanedVal)) {
                  verifiedList.push(val);
                  matchFound = true;
                  break;
                }
              } else {
                verifiedList.push(val);
                matchFound = true;
                break;
              }
            }

            // Silent carrier mismatch checks (as requested: log mismatch without toast interruption)
            if (!matchFound) {
              for (const b of raw.barcodes) {
                const val = b.rawValue;
                if (!val) continue;
                const cleanedVal = this.cleanTrackingNumber(val);
                if (cleanedVal.length < 14) continue;
                const other = getTracking(cleanedVal);
                if (other?.name && other.name.toLowerCase() !== this.selectedPartner.toLowerCase()) {
                  this.log('Silenced carrier mismatch: scanned ' + other.name + ' but expected ' + this.selectedPartner);
                }
              }
            }

            if (verifiedList.length > 0) {
              barcodes = verifiedList;

              // ── Orientation detection from barcode geometry ────────────────
              // Since portrait lock may be active (preventing screen.orientation change),
              // geometry cornerPoints is our primary source of truth for the physical label orientation.
              const firstBarcode = raw.barcodes[0];
              const cp = firstBarcode.cornerPoints;
              if (cp && cp.length >= 2) {
                const p0x = Array.isArray(cp[0]) ? (cp[0] as any)[0] : (cp[0] as any).x ?? 0;
                const p1x = Array.isArray(cp[1]) ? (cp[1] as any)[0] : (cp[1] as any).x ?? 0;
                const p0y = Array.isArray(cp[0]) ? (cp[0] as any)[1] : (cp[0] as any).y ?? 0;
                const p1y = Array.isArray(cp[1]) ? (cp[1] as any)[1] : (cp[1] as any).y ?? 0;
                const dx = p1x - p0x;
                const dy = p1y - p0y;
                let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                if (angleDeg < 0) angleDeg += 360;

                // Map to closest 90-degree quadrant
                if (angleDeg > 45 && angleDeg <= 135) {
                  detectedAngle = 270;
                } else if (angleDeg > 135 && angleDeg <= 225) {
                  detectedAngle = 180;
                } else if (angleDeg > 225 && angleDeg <= 315) {
                  detectedAngle = 90;
                }
              }
            }
          }
        } catch (e: any) {
          this.log('Barcode read exception: ' + e?.message);
        }
      }

      // ── Step 2: OCR on full frame (when barcode scan finds nothing) ───────
      if (barcodes.length === 0) {
        // Try original orientation first
        const ocrResult = await this.getTextUsingMLKit(base64Only);
        if (ocrResult?.text) {
          barcodes = await this.getVerifiedBarcodesFromOCR(ocrResult);
        }

        // Multi-angle OCR fallback. Sideways or upside-down labels block OCR recognition completely.
        // We systematically rotate the canvas frame and re-detect at 180°, 90°, and 270°.
        if (barcodes.length === 0) {
          const rotationAngles = [180, 90, 270];
          for (const angle of rotationAngles) {
            const rotatedB64 = await this.rotateBase64Image(fullBase64, angle);
            const rotatedOnly = rotatedB64.replace(/^data:image\/jpeg;base64,/, '');
            const ocrResultRotated = await this.getTextUsingMLKit(rotatedOnly);
            if (ocrResultRotated?.text) {
              const matched = await this.getVerifiedBarcodesFromOCR(ocrResultRotated);
              if (matched.length > 0) {
                barcodes = matched;
                detectedAngle = angle;
                break;
              }
            }
          }
        }
      }

      if (barcodes.length > 0) {
        this.consecutiveMisses = 0;

        // Haptic feedback
        try { navigator.vibrate(80); } catch {}

        // Apply rotation to stored photo when orientation was detected (e.g., label is sideways or upside down on the package)
        let finalPhoto = fullBase64;
        if (detectedAngle > 0) {
          this.log('Auto rotating image by ' + detectedAngle + ' degrees to align label text right-side up.');
          finalPhoto = await this.rotateBase64Image(fullBase64, detectedAngle);
        }

        for (const barcode of barcodes) {
          const cleanedBarcode = this.cleanTrackingNumber(barcode);
          let cut = this.selectedCarrierObj?.considerDigits ?? cleanedBarcode.length;
          if (cut === 0) cut = cleanedBarcode.length;
          const tracking = cleanedBarcode.slice(cut === cleanedBarcode.length ? 0 : cut).trim().toUpperCase();
          
          const isLocalDup = this.batchItems.some(i => i.trackingNumber.toUpperCase() === tracking);
          if (isLocalDup) {
            this.playSound('duplicate');
            this.showToast('⚠️ Already scanned in this batch', 'warning', 1500);
            nextDelay = 1000;
            continue;
          }

          const isDbDup = await this.checkDuplicateInDatabase(tracking);
          if (isDbDup) {
            this.playSound('duplicate');
            this.showToast('⚠️ Already Scanned', 'danger', 1500);
            nextDelay = 1200;
            continue;
          }

          this.batchItems.unshift({
            id: this.batchItems.length + 1,
            trackingNumber: tracking,
            carrier: this.selectedPartner,
            status: 'normal',
            labelPhoto: finalPhoto, // save oriented photo
            isSync: false,
            scannedAt: Date.now()
          });
          this.saveBatchState();
          this.playSound('scanned');
          this.showToast('✓ Scanned: ' + tracking, 'success', 1000);
          nextDelay = 1500; // pause so operator can move to the next box
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
      // Disable mismatch toast and sound as requested by user
      if (err?.message?.includes('Carrier mismatch')) {
        this.log('Silenced carrier mismatch: ' + err.message);
      } else {
        this.showToast(err?.message || 'Scan error', 'danger', 1800);
      }
      nextDelay = 1000;
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

    let matchFound = false;
    for (const b of raw.barcodes) {
      const val = b.rawValue;
      if (!val) continue;

      const cleanedVal = this.cleanTrackingNumber(val);

      if (this.selectedCarrierObj.type && this.selectedCarrierObj.validityType === 'auto') {
        if (getTracking(cleanedVal, [this.selectedCarrierObj.type])) {
          results.push(val);
          matchFound = true;
          break;
        }
      } else if (this.selectedCarrierObj.regexPattern) {
        if (this.selectedCarrierObj.regexPattern.test(cleanedVal)) {
          results.push(val);
          matchFound = true;
          break;
        }
      } else {
        results.push(val);
        matchFound = true;
        break;
      }
    }

    if (!matchFound) {
      for (const b of raw.barcodes) {
        const val = b.rawValue;
        if (!val) continue;
        const cleanedVal = this.cleanTrackingNumber(val);
        // Only throw a carrier mismatch if the barcode STRONGLY matches a
        // known shipping carrier (length ≥ 14 to filter out UPC/EAN product
        // codes and short retail codes that are not shipping labels)
        if (cleanedVal.length < 14) continue;
        const other = getTracking(cleanedVal);
        if (other?.name && other.name.toLowerCase() !== this.selectedPartner.toLowerCase()) {
          throw new Error(`Carrier mismatch: scanned ${other.name}, expected ${this.selectedPartner}`);
        }
      }
    }

    return results;
  }

  async getTextUsingMLKit(b64: string): Promise<any> {
    try {
      return await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: b64, rotation: 0 });
    } catch { return null; }
  }

  async checkDuplicateInDatabase(tracking: string): Promise<boolean> {
    try {
      const dbPackages = await firstValueFrom(this.db.getPackages({ trackingNumber: tracking, includeArchive: true }));
      return dbPackages.some(p => p.trackingNumber.toUpperCase() === tracking.toUpperCase());
    } catch (err) {
      this.log('Offline: Database duplicate verification disabled.');
      this.showToast('⚠️ Offline: Duplicate verification skipped', 'warning', 2000);
      return false;
    }
  }

  async rotateBase64Image(base64: string, degrees: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(base64); return; }
        
        if (degrees === 90 || degrees === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((degrees * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.onerror = () => resolve(base64);
      img.src = base64;
    });
  }

  cleanTrackingNumber(val: string): string {
    if (!val) return '';
    // If it's a URL containing ROADIE-, extract the ROADIE-... part
    if (val.toUpperCase().includes('ROADIE-')) {
      const match = val.match(/ROADIE-[A-Z0-9]+/i);
      if (match) return match[0].toUpperCase();
    }
    // If it's a standard URL, try to take the last segment
    if (val.includes('/') && (val.startsWith('http') || val.includes('.com'))) {
      const parts = val.split('/');
      const last = parts[parts.length - 1];
      if (last) return last.toUpperCase();
    }
    return val;
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
        batchItems: this.batchItems
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
        this.step                  = s.step || 'review';
        if (this.step === 'scan') this.activateCameraMode();
      }
    } catch (e) { console.error('Error restoring batch state', e); }
  }

  // ─── Step navigation ─────────────────────────────────────────────────────

  selectPartner(name: string) {
    this.selectedPartner    = name;
    this.selectedCarrierObj = this.allPartners.find(p => p.carrierName.toLowerCase() === name.toLowerCase()) || null;
    this.step               = 'scan';
    this.activateCameraMode();
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
    this.batchItems = [];
    localStorage.removeItem('delcargo_temp_batch');
    this.router.navigate(['/tabs/dashboard']);
  }

  // ─── Batch actions ────────────────────────────────────────────────────────

  updateItemStatus(item: BatchItem, status: 'normal' | 'missing' | 'damaged' | 'rejected') {
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

    const d    = new Date();
    const yy   = d.getFullYear().toString().slice(-2);
    const mm   = ('0' + (d.getMonth() + 1)).slice(-2);
    const dd   = ('0' + d.getDate()).slice(-2);
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    const serial = `REC-${yy}${mm}${dd}-${rand}`;

    let saved = 0;
    let failed = 0;
    const offlineQueue: Omit<Package, 'id' | 'receivedAt'>[] = [];

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

      this.db.savePackage(pkg).subscribe({
        next: () => {
          saved++;
          this.checkSubmissionComplete(saved, failed, serial, offlineQueue);
        },
        error: (err) => {
          failed++;
          offlineQueue.push(pkg);
          this.checkSubmissionComplete(saved, failed, serial, offlineQueue);
        }
      });
    });
  }

  private checkSubmissionComplete(saved: number, failed: number, serial: string, offlineQueue: Omit<Package, 'id' | 'receivedAt'>[]) {
    if ((saved + failed) === this.batchItems.length) {
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

      if (failed > 0) {
        // Save to offline queue
        const currentQueue = JSON.parse(localStorage.getItem('delcargo_offline_sync_queue') || '[]');
        currentQueue.push(...offlineQueue);
        localStorage.setItem('delcargo_offline_sync_queue', JSON.stringify(currentQueue));
        
        this.showToast(`⚠️ ${failed} items queued offline. Will sync when online.`, 'warning', 4000);
      } else {
        this.showToast('Receipt ' + serial + ' generated.', 'success');
      }

      this.batchItems = [];
      localStorage.removeItem('delcargo_temp_batch');
      this.step = 'receipt';
    }
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

  // ─── Custom DOM Toast (renders above camera-page which is on body) ────────
  showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success', duration = 2000) {
    // Remove existing toasts first to avoid stacking
    document.querySelectorAll('.scan-toast-overlay').forEach(el => el.remove());

    const colorMap: Record<string, string> = {
      success: 'linear-gradient(135deg,#1db954,#0a8a3a)',
      danger:  'linear-gradient(135deg,#e53935,#b71c1c)',
      warning: 'linear-gradient(135deg,#fb8c00,#e65100)'
    };

    const toast = document.createElement('div');
    toast.className = 'scan-toast-overlay';
    toast.textContent = message;
    Object.assign(toast.style, {
      position:     'fixed',
      bottom:       '120px',
      left:         '50%',
      transform:    'translateX(-50%)',
      background:   colorMap[color] || colorMap['success'],
      color:        '#fff',
      padding:      '12px 22px',
      borderRadius: '30px',
      fontFamily:   'Inter, sans-serif',
      fontSize:     '14px',
      fontWeight:   '600',
      boxShadow:    '0 6px 24px rgba(0,0,0,0.4)',
      zIndex:       '999999',
      whiteSpace:   'nowrap',
      maxWidth:     '88vw',
      overflow:     'hidden',
      textOverflow: 'ellipsis',
      opacity:      '0',
      transition:   'opacity 0.2s ease'
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // ─── Sound effects via Web Audio API ─────────────────────────────────────
  playSound(type: 'scanned' | 'duplicate' | 'mismatch') {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'scanned') {
        // Two quick ascending beeps — success confirmation
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'duplicate') {
        // Double descending beep — warning
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.setValueAtTime(400, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.28);
      } else if (type === 'mismatch') {
        // Low harsh buzz — error
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch (e) {
      // Audio not supported — fail silently
    }
  }

  log(msg: string) {
    const ts = new Date().toTimeString().slice(0, 8);
    const entry = `[${ts}] ${msg}`;
    console.log(entry);
    this.debugLogs.unshift(entry);
    if (this.debugLogs.length > 40) this.debugLogs.length = 40;
  }

  // ─── Full-screen photo zoom viewer ─────────────────────────────────────────

  openPhotoZoom(url: string | undefined | null) {
    if (!url) return;
    this.zoomImageUrl = url;
    this.viewerResetZoom();

    // Re-parent to document.body so it escapes the routed page's stacking
    // context (same technique used for .camera-page) — otherwise it can end
    // up rendered behind the floating tab bar.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector('.photo-zoom-backdrop') as HTMLElement;
      if (el && el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
    }));
  }

  closePhotoZoom() {
    const el = document.querySelector('.photo-zoom-backdrop') as HTMLElement;
    if (el && el.parentElement === document.body) {
      const host = document.querySelector('app-scanning ion-content');
      if (host) host.appendChild(el);
    }
    this.zoomImageUrl = null;
  }

  viewerResetZoom() {
    this.viewerScale = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;
    this.viewerTransition = 'transform 0.25s ease';
    this._updateViewerTransform();
  }

  viewerZoomStep(delta: number) {
    this.viewerScale = Math.min(5, Math.max(1, this.viewerScale + delta));
    this.viewerTransition = 'transform 0.2s ease';
    if (this.viewerScale === 1) { this.viewerTranslateX = 0; this.viewerTranslateY = 0; }
    this._updateViewerTransform();
  }

  private _updateViewerTransform() {
    this.viewerTransform =
      `scale(${this.viewerScale}) translate(${this.viewerTranslateX / this.viewerScale}px, ${this.viewerTranslateY / this.viewerScale}px)`;
  }

  private _pinchDist(t: TouchList): number {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  onZoomTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2) {
      this._vIsPinching = true;
      this._vLastTouchDist = this._pinchDist(e.touches);
      this.viewerTransition = 'none';
    } else if (e.touches.length === 1) {
      this._vIsPinching = false;
      this._vLastTouchX = e.touches[0].clientX;
      this._vLastTouchY = e.touches[0].clientY;
      this.viewerTransition = 'none';

      const now = Date.now();
      if (now - this._vLastTap < 300) {
        if (this.viewerScale > 1) { this.viewerResetZoom(); }
        else { this.viewerZoomStep(1); }
      }
      this._vLastTap = now;
    }
  }

  onZoomTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2 && this._vIsPinching) {
      const dist = this._pinchDist(e.touches);
      const ratio = dist / this._vLastTouchDist;
      this._vLastTouchDist = dist;
      this.viewerScale = Math.min(5, Math.max(1, this.viewerScale * ratio));
      if (this.viewerScale === 1) { this.viewerTranslateX = 0; this.viewerTranslateY = 0; }
      this._updateViewerTransform();
    } else if (e.touches.length === 1 && !this._vIsPinching && this.viewerScale > 1) {
      const dx = e.touches[0].clientX - this._vLastTouchX;
      const dy = e.touches[0].clientY - this._vLastTouchY;
      this._vLastTouchX = e.touches[0].clientX;
      this._vLastTouchY = e.touches[0].clientY;
      this.viewerTranslateX += dx;
      this.viewerTranslateY += dy;
      this._updateViewerTransform();
    }
  }

  onZoomTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) this._vIsPinching = false;
    this.viewerTransition = 'transform 0.15s ease';
  }
}
