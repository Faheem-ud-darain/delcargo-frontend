import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MockDbService, Package, User, Warehouse } from '../services/mock-db.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface SmartSearchResult {
  type: 'user' | 'warehouse' | 'package';
  tag: '[MANAGER]' | '[EMPLOYEE]' | '[WAREHOUSE]' | '[PACKAGE]';
  title: string;
  subtitle: string;
  data: any; // User | Warehouse | Package
}

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage {
  activeTab: string = 'dashboard';

  // Global Smart Search
  searchOpen: boolean = false;
  searchClosing: boolean = false;
  searchQuery: string = '';
  searchResults: SmartSearchResult[] = [];
  isSearching: boolean = false;
  searchExecuted: boolean = false;
  
  selectedResult: Package | null = null;
  fullScreenImageUrl: string | null = null;

  // Pinch-to-zoom viewer state
  viewerScale: number = 1;
  viewerTranslateX: number = 0;
  viewerTranslateY: number = 0;
  viewerRotation: number = 0; // manual rotation in degrees
  viewerTransform: string = 'scale(1) translate(0px, 0px) rotate(0deg)';
  viewerOrigin: string = 'center center';
  viewerTransition: string = 'transform 0.15s ease';

  // Touch tracking
  private _vLastTouchDist: number = 0;
  private _vLastTouchX: number = 0;
  private _vLastTouchY: number = 0;
  private _vLastTap: number = 0;
  private _vIsPinching: boolean = false;
  selectedUserResult: User | null = null;
  selectedWarehouseResult: Warehouse | null = null;
  
  selectedTimeFilter: 'all' | '24h' | '7d' | '30d' | '1y' = 'all';

  // Global Notifications Overlay
  notificationsOpen: boolean = false;
  notificationsClosing: boolean = false;
  mockNotifications: any[] = [];

  // Global Side Menu Overlay
  menuOpen: boolean = false;
  menuClosing: boolean = false;
  user: User | null = null;

  private currentUser: User | null = null;
  private searchSubject = new Subject<string>();

  // Smart suggestions for recent/popular
  readonly suggestions = [
    { label: 'FedEx', icon: 'cube-outline', query: 'FedEx' },
    { label: 'UPS', icon: 'cube-outline', query: 'UPS' },
    { label: 'Amazon', icon: 'cube-outline', query: 'Amazon' },
    { label: 'Today', icon: 'calendar-outline', query: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) },
    { label: 'Damaged', icon: 'alert-circle-outline', query: 'DAMAGE' },
    { label: 'Refund', icon: 'arrow-undo-outline', query: 'REFUND' },
  ];

  constructor(
    private auth: AuthService,
    private router: Router,
    private db: MockDbService
  ) {
    // Subscribe to user for warehouse scoping
    this.auth.currentUser$.subscribe(u => {
      this.currentUser = u;
      this.user = u;
      this.generateNotificationsForUser(u);
    });

    // Also regenerate if active warehouse changes (for managers/admins switching nodes)
    this.auth.activeWarehouseId$.subscribe(whId => {
      if (this.currentUser) {
        this.generateNotificationsForUser(this.currentUser);
      }
    });

    // Subscribe to global notifications open trigger
    this.auth.notificationsOpen$.subscribe(open => {
      if (open) {
        this.notificationsOpen = true;
        this.notificationsClosing = false;
      } else if (this.notificationsOpen) {
        this.notificationsClosing = true;
        setTimeout(() => {
          this.notificationsOpen = false;
          this.notificationsClosing = false;
        }, 420);
      }
    });

    // Subscribe to custom menu open trigger
    this.auth.menuOpen$.subscribe(open => {
      if (open) {
        this.menuOpen = true;
        this.menuClosing = false;
      } else if (this.menuOpen) {
        this.menuClosing = true;
        setTimeout(() => {
          this.menuOpen = false;
          this.menuClosing = false;
        }, 420);
      }
    });

    // Debounce search input
    this.searchSubject.pipe(
      debounceTime(280),
      distinctUntilChanged()
    ).subscribe(q => this.runSearch(q));
  }

  setCurrentTab(event: any) {
    if (event && event.tab) {
      this.activeTab = event.tab;
    }
  }

  // ─── Global Search ───────────────────────────────

  openSearch() {
    this.searchOpen = true;
    this.searchQuery = '';
    this.searchResults = [];
    this.searchExecuted = false;
    this.selectedResult = null;
    this.selectedUserResult = null;
    this.selectedWarehouseResult = null;
    // Auto-focus input
    setTimeout(() => {
      const el = document.getElementById('global-search-input') as HTMLInputElement;
      if (el) el.focus();
    }, 80);
  }

  closeSearch() {
    // Animate circle collapse back to button before hiding
    this.searchClosing = true;
    setTimeout(() => {
      this.searchOpen = false;
      this.searchClosing = false;
      this.searchQuery = '';
      this.searchResults = [];
      this.searchExecuted = false;
      this.selectedResult = null;
      this.selectedUserResult = null;
      this.selectedWarehouseResult = null;
    }, 420);
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (!value.trim()) {
      this.searchResults = [];
      this.searchExecuted = false;
      return;
    }
    this.isSearching = true;
    this.searchSubject.next(value.trim());
  }

  runSearch(q: string) {
    const user = this.currentUser;
    if (!q || !user) {
      this.isSearching = false;
      return;
    }

    const searchResultsList: SmartSearchResult[] = [];

    // 1. Search Packages
    const pkgFilters: any = {
      query: q,
      includeArchive: true
    };
    if (user.role !== 'admin') {
      pkgFilters.warehouseId = user.warehouseId;
    }

    this.db.getPackages(pkgFilters).subscribe(packages => {
      const now = new Date().getTime();
      let filteredPkgs = packages;

      if (this.selectedTimeFilter !== 'all') {
        let msLimit = 0;
        if (this.selectedTimeFilter === '24h') {
          msLimit = 24 * 60 * 60 * 1000;
        } else if (this.selectedTimeFilter === '7d') {
          msLimit = 7 * 24 * 60 * 60 * 1000;
        } else if (this.selectedTimeFilter === '30d') {
          msLimit = 30 * 24 * 60 * 60 * 1000;
        } else if (this.selectedTimeFilter === '1y') {
          msLimit = 365 * 24 * 60 * 60 * 1000;
        }
        
        filteredPkgs = packages.filter(pkg => {
          const pkgTime = new Date(pkg.receivedAt).getTime();
          return (now - pkgTime) <= msLimit;
        });
      }

      filteredPkgs.forEach(pkg => {
        searchResultsList.push({
          type: 'package',
          tag: '[PACKAGE]',
          title: pkg.trackingNumber,
          subtitle: `${pkg.carrier} • ${pkg.warehouseName}`,
          data: pkg
        });
      });

      // 2. Search Users (Admin searches all, Manager searches own warehouse)
      if (user.role === 'admin' || user.role === 'manager') {
        const warehouseLimit = user.role === 'manager' ? user.warehouseId : undefined;
        this.db.getUsers(warehouseLimit).subscribe(users => {
          const matchedUsers = users.filter(u =>
            u.username.toLowerCase().includes(q.toLowerCase()) ||
            u.email.toLowerCase().includes(q.toLowerCase()) ||
            u.role.toLowerCase().includes(q.toLowerCase())
          );

          matchedUsers.forEach(u => {
            searchResultsList.push({
              type: 'user',
              tag: u.role === 'manager' ? '[MANAGER]' : '[EMPLOYEE]',
              title: u.username,
              subtitle: `${u.email} • ${u.warehouseName || 'No Warehouse'}`,
              data: u
            });
          });

          // 3. Search Warehouses (Admin searches all, Manager only sees their own)
          this.db.getWarehouses().subscribe(warehouses => {
            const matchedWh = warehouses.filter(w => {
              if (user.role === 'manager' && w.id !== user.warehouseId) {
                return false;
              }
              return w.name.toLowerCase().includes(q.toLowerCase()) ||
                     w.location.toLowerCase().includes(q.toLowerCase()) ||
                     w.id.toLowerCase().includes(q.toLowerCase());
            });

            matchedWh.forEach(w => {
              searchResultsList.push({
                type: 'warehouse',
                tag: '[WAREHOUSE]',
                title: w.name,
                subtitle: `${w.id} • ${w.location}`,
                data: w
              });
            });

            this.searchResults = searchResultsList;
            this.isSearching = false;
            this.searchExecuted = true;
          });
        });
      } else {
        this.searchResults = searchResultsList;
        this.isSearching = false;
        this.searchExecuted = true;
      }
    });
  }

  setTimeFilter(filter: 'all' | '24h' | '7d' | '30d' | '1y') {
    this.selectedTimeFilter = filter;
    if (this.searchQuery) {
      this.isSearching = true;
      this.runSearch(this.searchQuery);
    }
  }

  applySuggestion(q: string) {
    this.searchQuery = q;
    this.isSearching = true;
    this.searchExecuted = false;
    this.runSearch(q);
  }

  async openResult(result: SmartSearchResult) {
    if (result.type === 'package') {
      const pkg = result.data;
      if (pkg.labelPhoto && pkg.labelPhoto.startsWith('[Stored locally')) {
        try {
          const file = await Filesystem.readFile({
            path: `label_${pkg.id}.jpg`,
            directory: Directory.Data
          });
          pkg.localPhotoUrl = `data:image/jpeg;base64,${file.data}`;
        } catch (e) {
          pkg.localPhotoUrl = '';
        }
      }
      this.selectedResult = pkg;
    } else if (result.type === 'user') {
      this.selectedUserResult = result.data;
    } else if (result.type === 'warehouse') {
      this.selectedWarehouseResult = result.data;
    }
  }

  closeResult() {
    this.selectedResult = null;
    this.selectedUserResult = null;
    this.selectedWarehouseResult = null;
  }

  getStatusFlags(pkg: Package) {
    if (!pkg) return { isDamage: false, isRefund: false, isOk: true };
    return {
      isDamage: pkg.trackingNumber.includes('[DAMAGE]'),
      isRefund: pkg.trackingNumber.includes('[REFUND]'),
      isOk: !pkg.trackingNumber.includes('[DAMAGE]') && !pkg.trackingNumber.includes('[REFUND]')
    };
  }

  closeNotifications() {
    this.auth.closeNotifications();
  }

  generateNotificationsForUser(user: User | null) {
    if (!user) {
      this.mockNotifications = [];
      return;
    }

    const warehouseName = user.warehouseName || 'Seattle North Port';
    const warehouseId = user.warehouseId || 'W01';

    if (user.role === 'admin') {
      this.mockNotifications = [
        { title: 'Global System Online', body: 'All 4 warehouse nodes are online and sync active.', time: 'Just now', icon: 'globe-outline', type: 'success' },
        { title: 'New Package Scanned', body: `Package received at W01 (Seattle) by alex_staff.`, time: '5m ago', icon: 'cube-outline', type: 'info' },
        { title: 'Security Alert', body: 'Admin credentials logged in from new IP address 127.0.0.1.', time: '15m ago', icon: 'shield-checkmark-outline', type: 'warning' },
        { title: 'Manager Assigned', body: 'sarah_manager assigned to node W01 (Seattle North Port).', time: '1h ago', icon: 'people-outline', type: 'success' },
        { title: 'Node W02 Alert', body: 'LAX Gateway Hub (W02) daily processed limit exceeded 90%.', time: '3h ago', icon: 'alert-circle-outline', type: 'warning' }
      ];
    } else if (user.role === 'manager') {
      this.mockNotifications = [
        { title: 'Manager Session Active', body: `Welcome back, @${user.username}. Scoped to Node ${warehouseId} (${warehouseName}).`, time: 'Just now', icon: 'shield-checkmark-outline', type: 'success' },
        { title: 'Operator Shift Active', body: 'Employee alex_staff checked-in and active on-site.', time: '10m ago', icon: 'person-outline', type: 'info' },
        { title: 'Warehouse Stats Summary', body: `${warehouseName} daily activity stable. Storage is stable.`, time: '30m ago', icon: 'business-outline', type: 'success' },
        { title: 'Package Dispatch Ready', body: 'FedEx carrier clearance verified for 2 outgoing items.', time: '2h ago', icon: 'airplane-outline', type: 'info' }
      ];
    } else {
      this.mockNotifications = [
        { title: 'Shift Started Successfully', body: `Connected to scanner station at ${warehouseName}.`, time: 'Just now', icon: 'checkmark-circle-outline', type: 'success' },
        { title: 'Scanned Successfully', body: 'Package 773489104820 processed and synced to ledger.', time: '12m ago', icon: 'cube-outline', type: 'info' },
        { title: 'Assigned Warehouse Node', body: `Your account is scoped strictly to node ${warehouseId} (${warehouseName}).`, time: '2h ago', icon: 'location-outline', type: 'info' }
      ];
    }
  }

  closeMenu() {
    this.auth.closeMenu();
  }

  navigateToRoute(route: string) {
    this.router.navigate([route]);
    this.closeMenu();
  }

  logout() {
    this.auth.logout();
    this.closeMenu();
    this.router.navigate(['/login']);
  }

  // ─── Pinch-to-zoom viewer ─────────────────────────────────────────────────

  openImageViewer(url: string) {
    this.fullScreenImageUrl = url;
    this.viewerResetZoom();
    // Hide hint after 2.5s
    setTimeout(() => {
      const hint = document.getElementById('zoomHintPill');
      if (hint) hint.style.opacity = '0';
    }, 2500);
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

  onViewerTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2) {
      this._vIsPinching = true;
      this._vLastTouchDist = this._pinchDist(e.touches);
      this.viewerTransition = 'none'; // instant during pinch
    } else if (e.touches.length === 1) {
      this._vIsPinching = false;
      this._vLastTouchX = e.touches[0].clientX;
      this._vLastTouchY = e.touches[0].clientY;
      this.viewerTransition = 'none';

      // Double-tap detection
      const now = Date.now();
      if (now - this._vLastTap < 300) {
        if (this.viewerScale > 1) { this.viewerResetZoom(); }
        else { this.viewerZoomStep(1); }
      }
      this._vLastTap = now;
    }
  }

  onViewerTouchMove(e: TouchEvent) {
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

  onViewerTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) this._vIsPinching = false;
    this.viewerTransition = 'transform 0.15s ease';
  }
}
