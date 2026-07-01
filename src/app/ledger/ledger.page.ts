import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Package, Warehouse } from '../services/mock-db.service';
import { Filesystem, Directory } from '@capacitor/filesystem';

@Component({
  selector: 'app-ledger',
  templateUrl: 'ledger.page.html',
  styleUrls: ['ledger.page.scss'],
  standalone: false
})
export class LedgerPage implements OnInit {
  user: User | null = null;
  warehouses: Warehouse[] = [];
  packages: Package[] = [];
  selectedPackage: Package | null = null;
  fullScreenImageUrl: string | null = null;
  isLoading: boolean = false;
  showAll: boolean = false;
  isScrolled: boolean = false;

  // ─── Full-screen photo zoom viewer (pinch / double-tap to zoom) ──────────
  viewerScale: number = 1;
  viewerTranslateX: number = 0;
  viewerTranslateY: number = 0;
  viewerRotation: number = 0; // manual rotation in degrees
  viewerTransform: string = 'scale(1) translate(0px, 0px) rotate(0deg)';
  viewerTransition: string = 'transform 0.15s ease';
  private _vLastTouchDist: number = 0;
  private _vLastTouchX: number = 0;
  private _vLastTouchY: number = 0;
  private _vLastTap: number = 0;
  private _vIsPinching: boolean = false;

  selectedWarehouseId: string | null = null;
  selectedWarehouse: Warehouse | null = null;
  selectedWarehousePackages: Package[] = [];
  allWarehousePackages: Package[] = [];
  filteredWarehousePackages: Package[] = [];
  selectedWarehouseUsers: User[] = [];
  filteredWarehouseUsers: User[] = [];
  
  whTimeFilter: 'all' | 'day' | 'month' | 'year' = 'all';
  whOperatorFilter: string = '';
  whSearchQuery: string = '';
  
  warehouseStats: { [key: string]: { live: number, archive: number, operators: number, lastActivity?: string } } = {};

  stats = {
    liveCount: 0,
    archiveCount: 0
  };

  filters = {
    warehouseId: '',
    carrier: '',
    trackingNumber: '',
    query: '',
    includeArchive: false
  };

  constructor(
    public auth: AuthService,
    private db: MockDbService,
    private router: Router
  ) {}

  ngOnInit() {
    this.auth.currentUser$.subscribe(u => {
      this.user = u;
      if (u) {
        // Warehouse restriction for Users/Managers
        if (u.role !== 'admin') {
          this.filters.warehouseId = u.warehouseId || '';
          // Seed the active warehouse for Manager default view
          this.db.getWarehouses().subscribe(whs => {
            const myWh = whs.find(w => w.id === u.warehouseId);
            if (myWh) this.selectWarehouse(myWh);
          });
        } else {
          this.filters.warehouseId = ''; // Admins see all by default
        }
        this.loadWarehouses();
        this.fetchPackages();
        this.fetchStats();
        if (u.role === 'admin') {
          this.fetchWarehouseStats();
        }
      }
    });
  }

  ionViewWillEnter() {
    // Refresh packages when navigation happens
    if (this.user) {
      this.fetchPackages();
      this.fetchStats();
      if (this.user.role === 'admin') {
        this.fetchWarehouseStats();
        if (this.selectedWarehouse) {
          this.selectWarehouse(this.selectedWarehouse);
        }
      } else if (this.user.role === 'manager' && this.selectedWarehouse) {
        this.selectWarehouse(this.selectedWarehouse);
      }
    }
  }

  // Org-wide totals across all warehouses, shown above the warehouse grid
  // (admin overview) so there's an at-a-glance summary before drilling in.
  get orgTotals() {
    let live = 0, archive = 0, operators = 0;
    for (const wh of this.warehouses) {
      const s = this.warehouseStats[wh.id];
      if (s) { live += s.live; archive += s.archive; operators += s.operators; }
    }
    return { live, archive, operators, warehouseCount: this.warehouses.length };
  }

  loadWarehouses() {
    this.db.getWarehouses().subscribe(list => {
      this.warehouses = list;
    });
  }

  fetchWarehouseStats() {
    this.db.getWarehouses().subscribe(whs => {
      whs.forEach(wh => {
        // Get Live & Archive package counts
        this.db.getPackages({ warehouseId: wh.id, includeArchive: true }).subscribe(allPkgs => {
          const livePkgs = allPkgs.filter(p => {
            const threeMonthsAgo = new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000);
            return p.receivedAt >= threeMonthsAgo;
          });
          const archiveCount = allPkgs.length - livePkgs.length;
          
          let lastAct = 'No packages';
          if (allPkgs.length > 0) {
            const sorted = [...allPkgs].sort((a,b) => b.receivedAt.getTime() - a.receivedAt.getTime());
            lastAct = `${sorted[0].carrier}: ${sorted[0].trackingNumber}`;
          }

          // Get Operators count
          this.db.getUsers(wh.id).subscribe(users => {
            this.warehouseStats[wh.id] = {
              live: livePkgs.length,
              archive: archiveCount,
              operators: users.length,
              lastActivity: lastAct
            };
          });
        });
      });
    });
  }

  fetchStats() {
    // Get live packages
    this.db.getPackages({ warehouseId: this.filters.warehouseId, includeArchive: false }).subscribe(list => {
      this.stats.liveCount = list.length;
    });
    // Get archived packages (3-6 months) by checking the diff between including archive and not
    this.db.getPackages({ warehouseId: this.filters.warehouseId, includeArchive: true }).subscribe(list => {
      this.stats.archiveCount = Math.max(0, list.length - this.stats.liveCount);
    });
  }

  fetchPackages() {
    this.isLoading = true;
    // Ledger shows ALL packages in the warehouse (not filtered by operator)
    this.db.getPackages(this.filters).subscribe({
      next: (list) => {
        this.packages = list;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  selectWarehouse(wh: Warehouse) {
    this.selectedWarehouseId = wh.id;
    this.selectedWarehouse = wh;
    this.isLoading = true;
    this.whTimeFilter = 'all';
    this.whOperatorFilter = '';
    this.whSearchQuery = '';
    
    // Fetch packages for this warehouse (both live and archived)
    this.db.getPackages({ warehouseId: wh.id, includeArchive: true }).subscribe(list => {
      this.allWarehousePackages = list;
      this.selectedWarehousePackages = list;
      this.applyWarehouseFilters();
      this.isLoading = false;
    });

    // Fetch operators at this warehouse
    this.db.getUsers(wh.id).subscribe(users => {
      this.selectedWarehouseUsers = users;
      this.filteredWarehouseUsers = users;
    });
  }

  applyWarehouseFilters() {
    let filtered = [...this.allWarehousePackages];
    const now = new Date();

    // 1. Time range filter
    if (this.whTimeFilter === 'day') {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      filtered = filtered.filter(p => new Date(p.receivedAt) >= oneDayAgo);
    } else if (this.whTimeFilter === 'month') {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(p => new Date(p.receivedAt) >= oneMonthAgo);
    } else if (this.whTimeFilter === 'year') {
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(p => new Date(p.receivedAt) >= oneYearAgo);
    }

    // 2. Operator filter
    if (this.whOperatorFilter) {
      filtered = filtered.filter(p => p.receivedBy === this.whOperatorFilter);
    }

    // 3. Search query filter (Packages & Users)
    if (this.whSearchQuery.trim()) {
      const q = this.whSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(p =>
        p.trackingNumber.toLowerCase().includes(q) ||
        p.carrier.toLowerCase().includes(q) ||
        p.receivedBy.toLowerCase().includes(q)
      );
      this.filteredWarehouseUsers = this.selectedWarehouseUsers.filter(u =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    } else {
      this.filteredWarehouseUsers = [...this.selectedWarehouseUsers];
    }

    this.filteredWarehousePackages = filtered;
  }

  onWhTimeFilterChange(filter: 'all' | 'day' | 'month' | 'year') {
    this.whTimeFilter = filter;
    this.applyWarehouseFilters();
  }

  onWhOperatorFilterChange(username: string) {
    this.whOperatorFilter = username;
    this.applyWarehouseFilters();
  }

  onWhSearchInput() {
    this.applyWarehouseFilters();
  }

  clearWarehouseSelection() {
    this.selectedWarehouseId = null;
    this.selectedWarehouse = null;
    this.selectedWarehousePackages = [];
    this.allWarehousePackages = [];
    this.filteredWarehousePackages = [];
    this.selectedWarehouseUsers = [];
    this.filteredWarehouseUsers = [];
    this.whTimeFilter = 'all';
    this.whOperatorFilter = '';
    this.whSearchQuery = '';
    this.fetchPackages();
  }

  onFilterChange() {
    this.fetchPackages();
  }

  toggleShowAll() {
    this.showAll = !this.showAll;
  }

  async openDetail(pkg: Package) {
    if (pkg.labelPhoto && pkg.labelPhoto.startsWith('[Stored locally')) {
      try {
        const file = await Filesystem.readFile({
          path: `label_${pkg.id}.jpg`,
          directory: Directory.Data
        });
        (pkg as any).localPhotoUrl = `data:image/jpeg;base64,${file.data}`;
      } catch (e) {
        (pkg as any).localPhotoUrl = '';
      }
    }
    this.selectedPackage = pkg;

    // Re-parent the modal to document.body so it escapes this routed page's
    // stacking context (same technique used for .camera-page in scanning) —
    // otherwise its footer button can render behind the floating tab bar,
    // and the underlying ion-content can still capture scroll/touch.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector('.detail-backdrop') as HTMLElement;
      if (el && el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
    }));
  }

  closeDetail() {
    const el = document.querySelector('.detail-backdrop') as HTMLElement;
    if (el && el.parentElement === document.body) {
      const host = document.querySelector('app-ledger ion-content');
      if (host) host.appendChild(el);
    }
    this.selectedPackage = null;
    if (this.fullScreenImageUrl) this.closePhotoZoom();
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 30;
  }

  // ─── Full-screen photo zoom viewer ─────────────────────────────────────────
  // NOTE: this was previously a bare <img> popup defined inside ion-content
  // with no zoom and no scroll isolation — that's why zoom didn't work and
  // the background could still scroll when opened from this page. Now wired
  // up the same way as the rest of the app (pinch/double-tap zoom,
  // re-parented to document.body).

  openPhotoZoom(url: string | undefined | null) {
    if (!url) return;
    this.fullScreenImageUrl = url;
    this.viewerResetZoom();

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
      const host = document.querySelector('app-ledger ion-content');
      if (host) host.appendChild(el);
    }
    this.fullScreenImageUrl = null;
  }

  viewerResetZoom() {
    this.viewerScale = 1;
    this.viewerTranslateX = 0;
    this.viewerTranslateY = 0;
    this.viewerRotation = 0;
    this.viewerTransition = 'transform 0.25s ease';
    this._updateViewerTransform();
  }

  viewerZoomStep(delta: number) {
    this.viewerScale = Math.min(5, Math.max(1, this.viewerScale + delta));
    this.viewerTransition = 'transform 0.2s ease';
    if (this.viewerScale === 1) { this.viewerTranslateX = 0; this.viewerTranslateY = 0; }
    this._updateViewerTransform();
  }

  rotateManual(direction: 'right' | 'left') {
    const delta = direction === 'right' ? 90 : -90;
    this.viewerRotation = (this.viewerRotation + delta) % 360;
    this.viewerTransition = 'transform 0.25s cubic-bezier(0.1, 0.8, 0.3, 1)';
    this._updateViewerTransform();
  }

  private _updateViewerTransform() {
    this.viewerTransform =
      `scale(${this.viewerScale}) translate(${this.viewerTranslateX / this.viewerScale}px, ${this.viewerTranslateY / this.viewerScale}px) rotate(${this.viewerRotation}deg)`;
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
