import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Package, LoginHistoryEntry, Warehouse } from '../services/mock-db.service';

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

  // Admin / Manager Properties
  usersList: User[] = [];
  loginLogs: LoginHistoryEntry[] = [];
  filteredLoginLogs: LoginHistoryEntry[] = [];
  warehouses: Warehouse[] = [];
  adminSearchQuery: string = '';

  // Chart data sets
  dailyScansChart: { dateLabel: string; count: number; percentage: number }[] = [];
  whUsersChart: { whName: string; count: number; percentage: number }[] = [];

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

    if (this.user.role === 'admin' || this.user.role === 'manager') {
      const whId = this.user.role === 'manager' ? this.user.warehouseId : undefined;
      
      // Load Users list
      this.db.getUsers(whId).subscribe(list => {
        this.usersList = list;
      });

      // Load Login Logs
      this.db.getLoginHistory({ warehouseId: whId }).subscribe(logs => {
        this.loginLogs = logs;
        this.applyAdminFilter();
      });

      // Compile stats for charts
      this.db.getPackages({ warehouseId: whId, includeArchive: true }).subscribe(packagesList => {
        // Daily Scans over the last 5 days
        const chartData = [];
        const maxDays = 5;
        let maxCount = 1; // avoid divide by zero

        for (let i = maxDays - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          
          // count packages on this date
          const count = packagesList.filter(pkg => {
            const pkgDate = new Date(pkg.receivedAt);
            return pkgDate.getFullYear() === d.getFullYear() &&
                   pkgDate.getMonth() === d.getMonth() &&
                   pkgDate.getDate() === d.getDate();
          }).length;

          if (count > maxCount) maxCount = count;
          chartData.push({ dateLabel: label, count, percentage: 0 });
        }

        // calculate percentage for animations
        chartData.forEach(item => {
          item.percentage = Math.round((item.count / maxCount) * 100);
        });

        this.dailyScansChart = chartData;
      });

      // User Counts per Warehouse chart (Admins see all warehouses, Managers see their shift statuses)
      this.db.getWarehouses().subscribe(whs => {
        this.warehouses = whs;
        this.db.getUsers().subscribe(allUsers => {
          const chartData: any[] = [];
          let maxCount = 1;

          if (this.user?.role === 'admin') {
            whs.forEach(w => {
              const count = allUsers.filter(u => u.warehouseId === w.id).length;
              if (count > maxCount) maxCount = count;
              chartData.push({ whName: w.name, count, percentage: 0 });
            });
          } else {
            // Manager sees counts by role (Managers, Standard staff) at their warehouse
            const myWhId = this.user?.warehouseId;
            const staffCount = allUsers.filter(u => u.warehouseId === myWhId && u.role === 'user').length;
            const mgrCount = allUsers.filter(u => u.warehouseId === myWhId && u.role === 'manager').length;
            maxCount = Math.max(staffCount, mgrCount, 1);
            
            chartData.push({ whName: 'Standard Employees', count: staffCount, percentage: 0 });
            chartData.push({ whName: 'Warehouse Managers', count: mgrCount, percentage: 0 });
          }

          chartData.forEach(item => {
            item.percentage = Math.round((item.count / maxCount) * 100);
          });
          this.whUsersChart = chartData;
        });
      });

    }

    // Load personal scanned packages stats (for both Managers and standard Users who do scanning work)
    if (this.user.role !== 'admin') {
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
  }

  applyAdminFilter() {
    const q = this.adminSearchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredLoginLogs = [...this.loginLogs];
      return;
    }

    this.filteredLoginLogs = this.loginLogs.filter(log =>
      log.username.toLowerCase().includes(q) ||
      log.role.toLowerCase().includes(q) ||
      (log.warehouseName && log.warehouseName.toLowerCase().includes(q)) ||
      log.ipAddress.includes(q) ||
      new Date(log.timestamp).toLocaleString().toLowerCase().includes(q)
    );
  }

  onAdminSearchInput() {
    this.applyAdminFilter();
  }

  startScanning() {
    this.router.navigate(['/tabs/scanning']);
  }

  onScroll(event: any) {
    this.isScrolled = event.detail.scrollTop > 30;
  }
}
