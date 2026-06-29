import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export interface Warehouse {
  id: string;
  name: string;
  location: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'manager' | 'admin';
  warehouseId?: string;
  warehouseName?: string;
}

export interface Package {
  id: string;
  trackingNumber: string;
  carrier: string;
  receivedAt: Date;
  warehouseId: string;
  warehouseName: string;
  receivedBy: string;
  labelPhoto: string;
  deliveryCountPhotos: string[];
}

@Injectable({
  providedIn: 'root'
})
export class MockDbService {
  private warehouses: Warehouse[] = [
    { id: 'W01', name: 'Seattle North Port', location: 'Seattle, WA' },
    { id: 'W02', name: 'LAX Gateway Hub', location: 'Los Angeles, CA' },
    { id: 'W03', name: 'JFK Cargo Depot', location: 'Queens, NY' },
    { id: 'W04', name: 'Miami International Gate', location: 'Miami, FL' }
  ];

  private users: User[] = [
    { id: 'U01', username: 'alex_staff', email: 'user@warehouse.com', role: 'user', warehouseId: 'W01', warehouseName: 'Seattle North Port' },
    { id: 'U02', username: 'sarah_manager', email: 'manager@warehouse.com', role: 'manager', warehouseId: 'W01', warehouseName: 'Seattle North Port' },
    { id: 'U03', username: 'john_admin', email: 'admin@delcargo.com', role: 'admin' },
    { id: 'U04', username: 'mike_staff_la', email: 'la_user@warehouse.com', role: 'user', warehouseId: 'W02', warehouseName: 'LAX Gateway Hub' },
    { id: 'U05', username: 'carlos_staff_mia', email: 'mia_user@warehouse.com', role: 'user', warehouseId: 'W04', warehouseName: 'Miami International Gate' }
  ];

  private packages: Package[] = [];

  constructor(private http: HttpClient) {
    this.seedMockData();
  }

  private seedMockData() {
    const now = new Date();
    
    // Seed 1: Live package from 2 days ago (FedEx)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    this.packages.push({
      id: 'PKG1001',
      trackingNumber: '773489104820',
      carrier: 'FedEx',
      receivedAt: twoDaysAgo,
      warehouseId: 'W01',
      warehouseName: 'Seattle North Port',
      receivedBy: 'alex_staff',
      labelPhoto: 'assets/mock/labels/label_fedex.jpg',
      deliveryCountPhotos: ['assets/mock/carrier_screens/screen_fedex.jpg']
    });

    // Seed 2: Live package from 10 days ago (UPS)
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    this.packages.push({
      id: 'PKG1002',
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      receivedAt: tenDaysAgo,
      warehouseId: 'W01',
      warehouseName: 'Seattle North Port',
      receivedBy: 'alex_staff',
      labelPhoto: 'assets/mock/labels/label_ups.jpg',
      deliveryCountPhotos: []
    });

    // Seed 3: Live package from 25 days ago (Amazon)
    const twentyFiveDaysAgo = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000);
    this.packages.push({
      id: 'PKG1003',
      trackingNumber: 'TBA09485720938',
      carrier: 'Amazon',
      receivedAt: twentyFiveDaysAgo,
      warehouseId: 'W02',
      warehouseName: 'LAX Gateway Hub',
      receivedBy: 'mike_staff_la',
      labelPhoto: 'assets/mock/labels/label_amazon.jpg',
      deliveryCountPhotos: ['assets/mock/carrier_screens/screen_amazon.jpg']
    });

    // Seed 4: Archived package from 100 days ago (~3.3 months)
    const hundredDaysAgo = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000);
    this.packages.push({
      id: 'PKG1004',
      trackingNumber: '9400100000000000000000',
      carrier: 'USPS',
      receivedAt: hundredDaysAgo,
      warehouseId: 'W01',
      warehouseName: 'Seattle North Port',
      receivedBy: 'sarah_manager',
      labelPhoto: 'assets/mock/labels/label_usps.jpg',
      deliveryCountPhotos: []
    });

    // Seed 5: Archived package from 160 days ago (~5.3 months)
    const hundredSixtyDaysAgo = new Date(now.getTime() - 160 * 24 * 60 * 60 * 1000);
    this.packages.push({
      id: 'PKG1005',
      trackingNumber: '772938102941',
      carrier: 'FedEx',
      receivedAt: hundredSixtyDaysAgo,
      warehouseId: 'W03',
      warehouseName: 'JFK Cargo Depot',
      receivedBy: 'john_admin',
      labelPhoto: 'assets/mock/labels/label_dhl.jpg',
      deliveryCountPhotos: ['assets/mock/carrier_screens/screen_dhl.jpg']
    });

    // Seed 6: Live package from 4 days ago (DHL) for W04 (Miami)
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    this.packages.push({
      id: 'PKG1006',
      trackingNumber: 'JD1009847291',
      carrier: 'DHL',
      receivedAt: fourDaysAgo,
      warehouseId: 'W04',
      warehouseName: 'Miami International Gate',
      receivedBy: 'carlos_staff_mia',
      labelPhoto: 'assets/mock/labels/label_dhl.jpg',
      deliveryCountPhotos: []
    });

    // Note: Packages older than 180 days (6 months) are automatically deleted/not seeded.
  }

  // Get Warehouses
  getWarehouses(): Observable<Warehouse[]> {
    if (!environment.useMock) {
      return this.http.get<Warehouse[]>(`${environment.apiUrl}/warehouses`);
    }
    return of(this.warehouses);
  }

  // Get Packages with simulated delays to match requirements (fast live, slower archive)
  getPackages(filters?: {
    warehouseId?: string;
    carrier?: string;
    trackingNumber?: string;
    query?: string;
    startDate?: Date;
    endDate?: Date;
    includeArchive?: boolean;
  }): Observable<Package[]> {
    if (!environment.useMock) {
      const queryParams: any = {};
      if (filters) {
        Object.keys(filters).forEach(key => {
          const val = (filters as any)[key];
          if (val !== undefined && val !== null) {
            if (val instanceof Date) {
              queryParams[key] = val.toISOString();
            } else {
              queryParams[key] = String(val);
            }
          }
        });
      }
      return this.http.get<Package[]>(`${environment.apiUrl}/packages`, { params: queryParams });
    }

    let list = [...this.packages];
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Apply Live vs Archive rule
    const includeArchive = filters?.includeArchive ?? false;
    if (!includeArchive) {
      // Show only live data (0-3 months)
      list = list.filter(pkg => pkg.receivedAt >= threeMonthsAgo);
    } else {
      // Include archived up to 6 months (exclude older than 6 months)
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      list = list.filter(pkg => pkg.receivedAt >= sixMonthsAgo);
    }

    // Apply strict warehouse isolation bounds (User/Manager restricted)
    if (filters?.warehouseId) {
      list = list.filter(pkg => pkg.warehouseId === filters.warehouseId);
    }

    // Smart Search Query: matches tracking number, carrier, operator, or date
    if (filters?.query) {
      const q = filters.query.toLowerCase().trim();
      list = list.filter(pkg => {
        const dateStr = pkg.receivedAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }).toLowerCase();
        
        return pkg.trackingNumber.toLowerCase().includes(q) ||
               pkg.carrier.toLowerCase().includes(q) ||
               pkg.receivedBy.toLowerCase().includes(q) ||
               dateStr.includes(q);
      });
    }

    // Traditional filters (fallback)
    if (filters?.carrier && !filters.query) {
      list = list.filter(pkg => pkg.carrier.toLowerCase() === filters.carrier!.toLowerCase());
    }
    if (filters?.trackingNumber && !filters.query) {
      list = list.filter(pkg => pkg.trackingNumber.toLowerCase().includes(filters.trackingNumber!.toLowerCase()));
    }
    if (filters?.startDate) {
      list = list.filter(pkg => pkg.receivedAt >= filters.startDate!);
    }
    if (filters?.endDate) {
      list = list.filter(pkg => pkg.receivedAt <= filters.endDate!);
    }

    // Sort by most recent
    list.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    // Delay: archived searches take longer (e.g. 1200ms) than live queries (e.g. 200ms)
    const simulatedDelay = includeArchive ? 1200 : 200;
    return of(list).pipe(delay(simulatedDelay));
  }

  // Save Package
  savePackage(pkg: Omit<Package, 'id' | 'receivedAt'>): Observable<Package> {
    if (!environment.useMock) {
      return this.http.post<Package>(`${environment.apiUrl}/packages`, pkg);
    }

    const newPkg: Package = {
      ...pkg,
      id: 'PKG' + Math.floor(1000 + Math.random() * 9000),
      receivedAt: new Date()
    };
    this.packages.unshift(newPkg); // add to top
    return of(newPkg).pipe(delay(250));
  }

  // User Management
  getUsers(warehouseId?: string): Observable<User[]> {
    if (!environment.useMock) {
      const queryParams: any = {};
      if (warehouseId) queryParams.warehouseId = warehouseId;
      return this.http.get<User[]>(`${environment.apiUrl}/users`, { params: queryParams });
    }

    let list = [...this.users];
    if (warehouseId) {
      list = list.filter(u => u.warehouseId === warehouseId);
    }
    return of(list).pipe(delay(200));
  }

  addUser(user: Omit<User, 'id'>): Observable<User> {
    if (!environment.useMock) {
      return this.http.post<User>(`${environment.apiUrl}/users`, user);
    }

    const newUser: User = {
      ...user,
      id: 'U' + Math.floor(100 + Math.random() * 900)
    };
    if (newUser.warehouseId) {
      const wh = this.warehouses.find(w => w.id === newUser.warehouseId);
      if (wh) newUser.warehouseName = wh.name;
    }
    this.users.push(newUser);
    return of(newUser).pipe(delay(200));
  }

  deleteUser(userId: string): Observable<boolean> {
    if (!environment.useMock) {
      return this.http.delete<boolean>(`${environment.apiUrl}/users/${userId}`);
    }

    const idx = this.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      this.users.splice(idx, 1);
      return of(true).pipe(delay(200));
    }
    return of(false).pipe(delay(100));
  }
}
