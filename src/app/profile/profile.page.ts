import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Package } from '../services/mock-db.service';

@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  standalone: false
})
export class ProfilePage implements OnInit {
  user: User | null = null;
  myPackages: Package[] = [];
  filteredPackages: Package[] = [];
  isLoadingHistory: boolean = false;
  isScrolled: boolean = false;

  // Search filter query specifically for their profile history
  profileQuery: string = '';

  // Stats for the logged-in operator
  stats = {
    todayCount: 0,
    weekCount: 0,
    monthCount: 0
  };

  selectedResult: Package | null = null;

  constructor(
    public auth: AuthService,
    private db: MockDbService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.user = this.auth.currentUser;
    this.auth.currentUser$.subscribe(u => {
      this.user = u;
    });
  }

  getInitials(username: string): string {
    if (!username) return 'DC';
    const parts = username.split(/[_\s.-]+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  }

  ionViewWillEnter() {
    // Re-read user synchronously in case auth state changed between visits.
    if (!this.user) {
      this.user = this.auth.currentUser;
    }
    if (this.user) {
      this.fetchMyPackages();
    }
  }

  fetchMyPackages() {
    if (!this.user) return;
    this.isLoadingHistory = true;
    
    // Fetch packages (include archive so they see complete history)
    const options: any = { includeArchive: true };
    if (this.user.role !== 'admin') {
      options.warehouseId = this.user.warehouseId;
    }
    
    this.db.getPackages(options).subscribe(list => {
      // Filter for this user specifically (unless admin, who sees all)
      let matched = list;
      if (this.user?.role !== 'admin') {
        matched = list.filter(p => p.receivedBy === this.user?.username);
      }
      
      this.myPackages = matched.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
      
      this.calculateStats(matched);
      this.applyFilter();
      this.isLoadingHistory = false;
    });
  }

  calculateStats(packages: Package[]) {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 6); startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now); startOfMonth.setDate(now.getDate() - 29); startOfMonth.setHours(0, 0, 0, 0);

    this.stats.todayCount = packages.filter(p => new Date(p.receivedAt) >= startOfDay).length;
    this.stats.weekCount = packages.filter(p => new Date(p.receivedAt) >= startOfWeek).length;
    this.stats.monthCount = packages.filter(p => new Date(p.receivedAt) >= startOfMonth).length;
  }

  applyFilter() {
    const q = this.profileQuery.trim().toLowerCase();
    if (!q) {
      this.filteredPackages = [...this.myPackages];
      return;
    }
    this.filteredPackages = this.myPackages.filter(p => {
      return p.trackingNumber.toLowerCase().includes(q) ||
             p.carrier.toLowerCase().includes(q) ||
             p.receivedBy.toLowerCase().includes(q);
    });
  }

  onSearchInput(value: string) {
    this.profileQuery = value;
    this.applyFilter();
  }

  openDetail(pkg: Package) {
    this.selectedResult = pkg;

    // Re-parent the modal to document.body so it escapes this routed page's
    // stacking context (same technique used for .camera-page in scanning) —
    // otherwise its Done button can render behind the floating tab bar, and
    // the underlying ion-content can still capture scroll/touch.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector('.search-detail-backdrop') as HTMLElement;
      if (el && el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
    }));
  }

  closeDetail() {
    const el = document.querySelector('.search-detail-backdrop') as HTMLElement;
    if (el && el.parentElement === document.body) {
      const host = document.querySelector('app-profile ion-content');
      if (host) host.appendChild(el);
    }
    this.selectedResult = null;
  }

  getStatusFlags(pkg: Package) {
    return {
      isDamage: pkg.trackingNumber.includes('[DAMAGE]'),
      isRefund: pkg.trackingNumber.includes('[REFUND]'),
      isOk: !pkg.trackingNumber.includes('[DAMAGE]') && !pkg.trackingNumber.includes('[REFUND]')
    };
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 30;
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
