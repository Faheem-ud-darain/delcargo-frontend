import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Package, Warehouse } from '../services/mock-db.service';

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
  isLoading: boolean = false;
  showAll: boolean = false;
  isScrolled: boolean = false;

  selectedWarehouseId: string | null = null;
  selectedWarehouse: Warehouse | null = null;
  selectedWarehousePackages: Package[] = [];
  selectedWarehouseUsers: User[] = [];
  
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
      }
    }
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
    
    // Fetch packages for this warehouse (both live and archived)
    this.db.getPackages({ warehouseId: wh.id, includeArchive: true }).subscribe(list => {
      this.selectedWarehousePackages = list;
      this.isLoading = false;
    });

    // Fetch operators at this warehouse
    this.db.getUsers(wh.id).subscribe(users => {
      this.selectedWarehouseUsers = users;
    });
  }

  clearWarehouseSelection() {
    this.selectedWarehouseId = null;
    this.selectedWarehouse = null;
    this.selectedWarehousePackages = [];
    this.selectedWarehouseUsers = [];
    this.fetchPackages();
  }

  onFilterChange() {
    this.fetchPackages();
  }

  toggleShowAll() {
    this.showAll = !this.showAll;
  }

  openDetail(pkg: Package) {
    this.selectedPackage = pkg;
  }

  closeDetail() {
    this.selectedPackage = null;
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 30;
  }
}
