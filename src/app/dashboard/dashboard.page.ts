import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Package } from '../services/mock-db.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: 'dashboard.page.html',
  styleUrls: ['dashboard.page.scss'],
  standalone: false
})
export class DashboardPage implements OnInit {

  user: User | null = null;

  today: Date = new Date();
  isScrolled: boolean = false;

  todayPackages: Package[] = [];
  dashboardStats = {
    todayCount: 0,
    damageCount: 0,
    capacityUsed: 72
  };

  recentScannedPackages: Package[] = [];

  // Check if there's an in-progress batch to resume
  get hasPendingBatch(): boolean {
    return !!localStorage.getItem('delcargo_temp_batch');
  }

  constructor(
    public auth: AuthService,
    private db: MockDbService,
    private router: Router
  ) {}

  ngOnInit() {
    this.auth.currentUser$.subscribe(u => {
      this.user = u;
      if (u) this.loadDashboardStats();
    });
  }

  ionViewWillEnter() {
    if (this.user) this.loadDashboardStats();
  }

  loadDashboardStats() {
    if (!this.user) return;
    this.db.getPackages({ warehouseId: this.user.warehouseId, includeArchive: false }).subscribe(list => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayPkgs = list.filter(pkg =>
        pkg.receivedBy === this.user?.username &&
        new Date(pkg.receivedAt).getTime() >= today.getTime()
      );

      this.dashboardStats.todayCount  = todayPkgs.length;
      this.dashboardStats.damageCount = todayPkgs.filter(pkg =>
        pkg.trackingNumber.includes('[DAMAGE]') ||
        pkg.trackingNumber.includes('[REFUND]')  ||
        pkg.trackingNumber.includes('[REJECTED]') ||
        pkg.trackingNumber.includes('[MISSING]')
      ).length;

      this.todayPackages = [...todayPkgs].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
      this.recentScannedPackages = list.filter(p => p.receivedBy === this.user?.username).slice(0, 4);
    });
  }

  startScanning() {
    this.router.navigate(['/tabs/scanning']);
  }

  onScroll(event: any) {
    this.isScrolled = event.detail.scrollTop > 30;
  }
}
