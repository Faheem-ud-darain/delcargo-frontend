import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay, catchError, map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { Filesystem, Directory } from '@capacitor/filesystem';

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
  localPhotoUrl?: string;
}

export interface LoginHistoryEntry {
  id: string;
  userId: string;
  username: string;
  email: string;
  role: 'user' | 'manager' | 'admin';
  timestamp: Date;
  ipAddress: string;
  warehouseId?: string;
  warehouseName?: string;
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
  private loginHistory: LoginHistoryEntry[] = [];

  constructor(private http: HttpClient) {
    if ((environment as any).useSupabase) {
      this.warehouses = [];
      this.users = [];
      this.packages = [];
      this.loginHistory = [];
    } else {
      this.seedMockData();
    }
  }

  private seedMockData() {
    const now = new Date();
    
    // Seed logins
    this.loginHistory.push({
      id: 'L01',
      userId: 'U01',
      username: 'alex_staff',
      email: 'user@warehouse.com',
      role: 'user',
      timestamp: new Date(now.getTime() - 12 * 60 * 1000), // 12 mins ago
      ipAddress: '192.168.1.144',
      warehouseId: 'W01',
      warehouseName: 'Seattle North Port'
    });
    this.loginHistory.push({
      id: 'L02',
      userId: 'U02',
      username: 'sarah_manager',
      email: 'manager@warehouse.com',
      role: 'manager',
      timestamp: new Date(now.getTime() - 45 * 60 * 1000), // 45 mins ago
      ipAddress: '192.168.1.10',
      warehouseId: 'W01',
      warehouseName: 'Seattle North Port'
    });
    this.loginHistory.push({
      id: 'L03',
      userId: 'U04',
      username: 'mike_staff_la',
      email: 'la_user@warehouse.com',
      role: 'user',
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2h ago
      ipAddress: '172.16.4.52',
      warehouseId: 'W02',
      warehouseName: 'LAX Gateway Hub'
    });
    this.loginHistory.push({
      id: 'L04',
      userId: 'U05',
      username: 'carlos_staff_mia',
      email: 'mia_user@warehouse.com',
      role: 'user',
      timestamp: new Date(now.getTime() - 26 * 60 * 60 * 1000), // 1 day ago
      ipAddress: '10.0.0.12',
      warehouseId: 'W04',
      warehouseName: 'Miami International Gate'
    });
    this.loginHistory.push({
      id: 'L05',
      userId: 'U03',
      username: 'john_admin',
      email: 'admin@delcargo.com',
      role: 'admin',
      timestamp: new Date(now.getTime() - 1000), // Just now
      ipAddress: '127.0.0.1'
    });

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
  }

  private getSupabaseHeaders() {
    return {
      'apikey': (environment as any).supabaseKey || '',
      'Authorization': `Bearer ${(environment as any).supabaseKey || ''}`,
      'Content-Type': 'application/json'
    };
  }

  // Get Warehouses
  getWarehouses(): Observable<Warehouse[]> {
    if ((environment as any).useSupabase) {
      return this.http.get<Warehouse[]>(`${(environment as any).supabaseUrl}/rest/v1/warehouses`, {
        headers: this.getSupabaseHeaders()
      }).pipe(
        catchError(() => of(this.warehouses))
      );
    }

    if (!environment.useMock) {
      return this.http.get<Warehouse[]>(`${(environment as any).apiUrl}/warehouses`).pipe(
        catchError(() => of(this.warehouses))
      );
    }
    return of(this.warehouses);
  }

  private filterPackagesList(list: Package[], filters?: any): Package[] {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    let filtered = [...list];
    // Apply Live vs Archive rule
    const includeArchive = filters?.includeArchive ?? false;
    if (!includeArchive) {
      // Show only live data (0-3 months)
      filtered = filtered.filter(pkg => pkg.receivedAt >= threeMonthsAgo);
    } else {
      // Include archived up to 6 months
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(pkg => pkg.receivedAt >= sixMonthsAgo);
    }

    // Apply strict warehouse isolation bounds
    if (filters?.warehouseId) {
      filtered = filtered.filter(pkg => pkg.warehouseId === filters.warehouseId);
    }

    // Smart Search Query: matches tracking number, carrier, operator, or date
    if (filters?.query) {
      const q = filters.query.toLowerCase().trim();
      filtered = filtered.filter(pkg => {
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
      filtered = filtered.filter(pkg => pkg.carrier.toLowerCase() === filters.carrier!.toLowerCase());
    }
    if (filters?.trackingNumber && !filters.query) {
      filtered = filtered.filter(pkg => pkg.trackingNumber.toLowerCase().includes(filters.trackingNumber!.toLowerCase()));
    }
    if (filters?.startDate) {
      filtered = filtered.filter(pkg => pkg.receivedAt >= filters.startDate!);
    }
    if (filters?.endDate) {
      filtered = filtered.filter(pkg => pkg.receivedAt <= filters.endDate!);
    }

    // Sort by most recent
    filtered.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    return filtered;
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
    if ((environment as any).useSupabase) {
      let params: any = {};
      if (filters?.warehouseId) {
        params.warehouse_id = `eq.${filters.warehouseId}`;
      }
      return this.http.get<any[]>(`${(environment as any).supabaseUrl}/rest/v1/packages`, {
        headers: this.getSupabaseHeaders(),
        params: params
      }).pipe(
        map(rows => {
          const pkgs = rows.map(r => ({
            id: r.id,
            trackingNumber: r.tracking_number,
            carrier: r.carrier,
            receivedAt: new Date(r.received_at),
            warehouseId: r.warehouse_id,
            warehouseName: r.warehouse_name,
            receivedBy: r.received_by,
            labelPhoto: r.label_photo,
            deliveryCountPhotos: r.delivery_count_photos || []
          }));
          return this.filterPackagesList(pkgs, filters);
        }),
        catchError(() => of([]))
      );
    }

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
      return this.http.get<Package[]>(`${(environment as any).apiUrl}/packages`, { params: queryParams }).pipe(
        catchError(() => of([]))
      );
    }

    let list = this.filterPackagesList(this.packages, filters);
    const includeArchive = filters?.includeArchive ?? false;
    const simulatedDelay = includeArchive ? 1200 : 200;
    return of(list).pipe(delay(simulatedDelay));
  }

  // Save Package
  savePackage(pkg: Omit<Package, 'id' | 'receivedAt'>): Observable<Package> {
    const defaultId = 'PKG' + Math.floor(1000 + Math.random() * 9000);
    
    if ((environment as any).useSupabase) {
      // Save photo locally to filesystem
      if (pkg.labelPhoto && pkg.labelPhoto.startsWith('data:image')) {
        const cleanB64 = pkg.labelPhoto.replace(/^data:image\/\w+;base64,/, '');
        Filesystem.writeFile({
          path: `label_${defaultId}.jpg`,
          data: cleanB64,
          directory: Directory.Data
        }).catch(err => console.error('Failed to write package label image locally:', err));
      }

      const dbRow = {
        id: defaultId,
        tracking_number: pkg.trackingNumber,
        carrier: pkg.carrier,
        warehouse_id: pkg.warehouseId,
        warehouse_name: pkg.warehouseName,
        received_by: pkg.receivedBy,
        label_photo: `[Stored locally on device: label_${defaultId}.jpg (Testing Phase)]`,
        delivery_count_photos: [],
        received_at: new Date().toISOString()
      };
      return this.http.post<any[]>(`${(environment as any).supabaseUrl}/rest/v1/packages`, dbRow, {
        headers: {
          ...this.getSupabaseHeaders(),
          'Prefer': 'return=representation'
        }
      }).pipe(
        map(res => {
          const r = res[0] || dbRow;
          return {
            id: r.id,
            trackingNumber: r.tracking_number,
            carrier: r.carrier,
            receivedAt: new Date(r.received_at),
            warehouseId: r.warehouse_id,
            warehouseName: r.warehouse_name,
            receivedBy: r.received_by,
            labelPhoto: pkg.labelPhoto, // return original base64 to the local UI
            deliveryCountPhotos: pkg.deliveryCountPhotos || []
          };
        }),
        catchError(() => {
          const fallback = { ...pkg, id: defaultId, receivedAt: new Date() };
          this.packages.unshift(fallback);
          return of(fallback);
        })
      );
    }

    if (!environment.useMock) {
      return this.http.post<Package>(`${(environment as any).apiUrl}/packages`, pkg);
    }

    const newPkg: Package = {
      ...pkg,
      id: defaultId,
      receivedAt: new Date()
    };
    this.packages.unshift(newPkg); // add to top
    return of(newPkg).pipe(delay(250));
  }

  // User Management
  getUsers(warehouseId?: string): Observable<User[]> {
    if ((environment as any).useSupabase) {
      let params: any = {};
      if (warehouseId) {
        params.warehouse_id = `eq.${warehouseId}`;
      }
      return this.http.get<any[]>(`${(environment as any).supabaseUrl}/rest/v1/users`, {
        headers: this.getSupabaseHeaders(),
        params: params
      }).pipe(
        map(rows => rows.map(r => ({
          id: r.id,
          username: r.username,
          email: r.email,
          role: r.role,
          warehouseId: r.warehouse_id,
          warehouseName: r.warehouse_name
        }))),
        catchError(() => of(this.users.filter(u => !warehouseId || u.warehouseId === warehouseId)))
      );
    }

    if (!environment.useMock) {
      const queryParams: any = {};
      if (warehouseId) queryParams.warehouseId = warehouseId;
      return this.http.get<User[]>(`${(environment as any).apiUrl}/users`, { params: queryParams }).pipe(
        catchError(() => of(this.users.filter(u => !warehouseId || u.warehouseId === warehouseId)))
      );
    }

    let list = [...this.users];
    if (warehouseId) {
      list = list.filter(u => u.warehouseId === warehouseId);
    }
    return of(list).pipe(delay(200));
  }

  addUser(user: Omit<User, 'id'>): Observable<User> {
    const newUserId = 'U' + Math.floor(100 + Math.random() * 900);
    
    if ((environment as any).useSupabase) {
      const dbRow = {
        id: newUserId,
        username: user.username,
        email: user.email,
        role: user.role,
        warehouse_id: user.warehouseId || null,
        warehouse_name: user.warehouseName || null
      };
      return this.http.post<any[]>(`${(environment as any).supabaseUrl}/rest/v1/users`, dbRow, {
        headers: {
          ...this.getSupabaseHeaders(),
          'Prefer': 'return=representation'
        }
      }).pipe(
        map(res => {
          const r = res[0] || dbRow;
          return {
            id: r.id,
            username: r.username,
            email: r.email,
            role: r.role,
            warehouseId: r.warehouse_id || undefined,
            warehouseName: r.warehouse_name || undefined
          };
        }),
        catchError(() => {
          const fallback = { ...user, id: newUserId };
          this.users.push(fallback);
          return of(fallback);
        })
      );
    }

    if (!environment.useMock) {
      return this.http.post<User>(`${(environment as any).apiUrl}/users`, user);
    }

    const newUser: User = {
      ...user,
      id: newUserId
    };
    if (newUser.warehouseId) {
      const wh = this.warehouses.find(w => w.id === newUser.warehouseId);
      if (wh) newUser.warehouseName = wh.name;
    }
    this.users.push(newUser);
    return of(newUser).pipe(delay(200));
  }

  deleteUser(userId: string): Observable<boolean> {
    if ((environment as any).useSupabase) {
      return this.http.delete(`${(environment as any).supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
        headers: this.getSupabaseHeaders(),
        observe: 'response'
      }).pipe(
        map(res => res.status >= 200 && res.status < 300),
        catchError(() => of(false))
      );
    }

    if (!environment.useMock) {
      return this.http.delete<boolean>(`${(environment as any).apiUrl}/users/${userId}`);
    }

    const idx = this.users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      this.users.splice(idx, 1);
      return of(true).pipe(delay(200));
    }
    return of(false).pipe(delay(100));
  }

  getLoginHistory(filters?: { query?: string; warehouseId?: string }): Observable<LoginHistoryEntry[]> {
    if ((environment as any).useSupabase) {
      let params: any = {};
      if (filters?.warehouseId) {
        params.warehouse_id = `eq.${filters.warehouseId}`;
      }
      return this.http.get<any[]>(`${(environment as any).supabaseUrl}/rest/v1/login_history`, {
        headers: this.getSupabaseHeaders(),
        params: params
      }).pipe(
        map(rows => {
          const list = rows.map(r => ({
            id: r.id,
            userId: r.user_id,
            username: r.username,
            email: r.email,
            role: r.role,
            timestamp: new Date(r.timestamp),
            ipAddress: r.ip_address,
            warehouseId: r.warehouse_id,
            warehouseName: r.warehouse_name
          }));
          
          if (filters?.query) {
            const q = filters.query.toLowerCase().trim();
            return list.filter(l =>
              l.username.toLowerCase().includes(q) ||
              l.role.toLowerCase().includes(q) ||
              (l.warehouseName && l.warehouseName.toLowerCase().includes(q)) ||
              l.ipAddress.includes(q)
            );
          }
          list.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          return list;
        }),
        catchError(() => of([]))
      );
    }

    if (!environment.useMock) {
      const queryParams: any = {};
      if (filters?.warehouseId) queryParams.warehouseId = filters.warehouseId;
      if (filters?.query) queryParams.query = filters.query;
      return this.http.get<LoginHistoryEntry[]>(`${(environment as any).apiUrl}/login-history`, { params: queryParams }).pipe(
        catchError(() => of([]))
      );
    }

    let list = [...this.loginHistory];
    if (filters?.warehouseId) {
      list = list.filter(l => l.warehouseId === filters.warehouseId);
    }
    if (filters?.query) {
      const q = filters.query.toLowerCase().trim();
      list = list.filter(l =>
        l.username.toLowerCase().includes(q) ||
        l.role.toLowerCase().includes(q) ||
        (l.warehouseName && l.warehouseName.toLowerCase().includes(q)) ||
        l.ipAddress.includes(q)
      );
    }
    list.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return of(list).pipe(delay(150));
  }

  addLoginLog(user: User): void {
    const entry = {
      id: 'L' + Math.floor(1000 + Math.random() * 9000),
      user_id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      timestamp: new Date().toISOString(),
      ip_address: '192.168.1.' + Math.floor(2 + Math.random() * 253),
      warehouse_id: user.warehouseId || null,
      warehouse_name: user.warehouseName || null
    };

    if ((environment as any).useSupabase) {
      this.http.post(`${(environment as any).supabaseUrl}/rest/v1/login_history`, entry, {
        headers: this.getSupabaseHeaders()
      }).subscribe({
        error: (err) => console.error('Failed to log login in Supabase:', err)
      });
    } else {
      this.loginHistory.unshift({
        id: entry.id,
        userId: entry.user_id,
        username: entry.username,
        email: entry.email,
        role: entry.role as any,
        timestamp: new Date(),
        ipAddress: entry.ip_address,
        warehouseId: entry.warehouse_id || undefined,
        warehouseName: entry.warehouse_name || undefined
      });
    }
  }
}
