import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MockDbService, Package } from '../services/mock-db.service';
import { User } from '../services/mock-db.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

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
  searchResults: Package[] = [];
  isSearching: boolean = false;
  searchExecuted: boolean = false;
  selectedResult: Package | null = null;
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
    if (!q || !this.currentUser) {
      this.isSearching = false;
      return;
    }
    this.db.getPackages({
      warehouseId: this.currentUser.warehouseId,
      query: q,
      includeArchive: true
    }).subscribe(results => {
      const now = new Date().getTime();
      let filtered = results;
      
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
        
        filtered = results.filter(pkg => {
          const pkgTime = new Date(pkg.receivedAt).getTime();
          return (now - pkgTime) <= msLimit;
        });
      }

      this.searchResults = filtered.sort((a, b) => {
        return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
      });
      
      this.isSearching = false;
      this.searchExecuted = true;
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

  openResult(pkg: Package) {
    this.selectedResult = pkg;
  }

  closeResult() {
    this.selectedResult = null;
  }

  getStatusFlags(pkg: Package) {
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
        { title: 'New Package Received', body: `FedEx package TBA1622633 received at Seattle North Port (W01) by alex_staff`, time: '5m ago', icon: 'cube-outline', type: 'info' },
        { title: 'Condition Alert', body: `UPS package JD419220 tagged as DAMAGE at Seattle North Port (W01) by alex_staff`, time: '12m ago', icon: 'alert-circle-outline', type: 'warning' },
        { title: 'Teammate Online', body: `sarah_manager logged in at Node W01 (Seattle North Port)`, time: '45m ago', icon: 'person-outline', type: 'success' },
        { title: 'Storage Notice', body: 'LAX Gateway Hub (W02) storage capacity reached 78%', time: '2h ago', icon: 'business-outline', type: 'info' },
        { title: 'Package Received', body: 'DHL package JD1009847291 received at Miami Gate (W04) by carlos_staff_mia', time: '3h ago', icon: 'cube-outline', type: 'info' }
      ];
      return;
    }

    this.mockNotifications = [
      { 
        title: 'New Package Received', 
        body: `FedEx package TBA1622 received at ${warehouseName} by teammate`, 
        time: '8m ago', 
        icon: 'cube-outline', 
        type: 'info' 
      },
      { 
        title: 'Condition Alert', 
        body: `UPS package tagged as DAMAGE at ${warehouseName}`, 
        time: '18m ago', 
        icon: 'alert-circle-outline', 
        type: 'warning' 
      },
      { 
        title: 'Warehouse Online', 
        body: `${user.username} successfully connected to Node ${warehouseId}`, 
        time: 'Just now', 
        icon: 'person-outline', 
        type: 'success' 
      },
      { 
        title: 'System Notice', 
        body: `${warehouseName} current capacity usage is stable at 65%`, 
        time: '1h ago', 
        icon: 'business-outline', 
        type: 'info' 
      }
    ];
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
}
