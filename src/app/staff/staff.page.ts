import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../services/auth.service';
import { MockDbService, User, Warehouse, Package } from '../services/mock-db.service';

export interface StaffMember {
  user: User;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  lastActivity: Date | null;
}

@Component({
  selector: 'app-staff',
  templateUrl: 'staff.page.html',
  styleUrls: ['staff.page.scss'],
  standalone: false
})
export class StaffPage implements OnInit {
  user: User | null = null;
  users: User[] = [];
  warehouses: Warehouse[] = [];
  staffMembers: StaffMember[] = [];
  isLoadingStaff: boolean = false;
  selectedPeriod: 'day' | 'week' | 'month' = 'day';
  isScrolled: boolean = false;

  newUser = {
    username: '',
    email: '',
    warehouseId: '',
    role: 'user' as 'user' | 'manager'
  };

  constructor(
    public auth: AuthService,
    private db: MockDbService,
    private router: Router,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.auth.currentUser$.subscribe(u => {
      this.user = u;
      if (u) {
        this.fetchUsers();
        if (u.role === 'admin') {
          this.loadWarehouses();
        }
      }
    });
  }

  ionViewWillEnter() {
    if (this.user) {
      this.fetchUsers();
    }
  }

  loadWarehouses() {
    this.db.getWarehouses().subscribe(list => {
      this.warehouses = list;
    });
  }

  fetchUsers() {
    if (!this.user) return;
    const filterWarehouseId = this.user.role !== 'admin' ? this.user.warehouseId : undefined;
    this.db.getUsers(filterWarehouseId).subscribe(list => {
      this.users = list;
      if (this.user?.role !== 'admin') {
        this.loadStaffStats(list);
      }
    });
  }

  loadStaffStats(members: User[]) {
    if (!this.user?.warehouseId) return;
    this.isLoadingStaff = true;
    this.db.getPackages({ warehouseId: this.user.warehouseId, includeArchive: false }).subscribe(packages => {
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 6); startOfWeek.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(now); startOfMonth.setDate(now.getDate() - 29); startOfMonth.setHours(0, 0, 0, 0);

      this.staffMembers = members.map(member => {
        const memberPkgs = packages.filter(p => p.receivedBy === member.username);
        return {
          user: member,
          todayCount: memberPkgs.filter(p => p.receivedAt >= startOfDay).length,
          weekCount: memberPkgs.filter(p => p.receivedAt >= startOfWeek).length,
          monthCount: memberPkgs.filter(p => p.receivedAt >= startOfMonth).length,
          lastActivity: memberPkgs.length > 0 ? [...memberPkgs].sort((a,b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0].receivedAt : null
        };
      });
      this.isLoadingStaff = false;
    });
  }

  getCountForPeriod(s: StaffMember): number {
    if (this.selectedPeriod === 'day') return s.todayCount;
    if (this.selectedPeriod === 'week') return s.weekCount;
    return s.monthCount;
  }

  getPeriodLabel(): string {
    if (this.selectedPeriod === 'day') return 'Today';
    if (this.selectedPeriod === 'week') return 'Week';
    return 'Month';
  }

  onCreateUser() {
    if (!this.newUser.username || !this.newUser.email || !this.user) return;
    const warehouseId = this.user.role === 'manager' ? this.user.warehouseId : this.newUser.warehouseId;
    const userRole = this.user.role === 'manager' ? 'user' : this.newUser.role;
    const userPayload: Omit<User, 'id'> = { username: this.newUser.username, email: this.newUser.email, role: userRole as 'user' | 'manager', warehouseId };
    this.db.addUser(userPayload).subscribe({
      next: (registered) => {
        this.showToast(`User ${registered.username} registered!`, 'success');
        this.fetchUsers();
        this.newUser = { username: '', email: '', warehouseId: '', role: 'user' };
      },
      error: () => this.showToast('Failed to register user.', 'danger')
    });
  }

  deleteUser(userId: string) {
    this.db.deleteUser(userId).subscribe(success => {
      if (success) { this.showToast('Staff member removed.', 'success'); this.fetchUsers(); }
      else { this.showToast('Could not remove staff member.', 'danger'); }
    });
  }

  goBack() { this.router.navigate(['/tabs/dashboard']); }

  async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastCtrl.create({ message, duration: 2000, color, position: 'bottom' });
    toast.present();
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 30;
  }
}
