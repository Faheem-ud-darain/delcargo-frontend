import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay, map, catchError } from 'rxjs/operators';
import { MockDbService, User } from './mock-db.service';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private activeWarehouseIdSubject = new BehaviorSubject<string | null>(null);
  public activeWarehouseId$ = this.activeWarehouseIdSubject.asObservable();

  constructor(
    private db: MockDbService,
    private http: HttpClient
  ) {
    // Check if session exists in local storage
    const savedUser = localStorage.getItem('dc_current_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser) as User;
        this.currentUserSubject.next(user);
        this.activeWarehouseIdSubject.next(user.warehouseId || 'W01');
      } catch (e) {
        this.logout();
      }
    }
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get activeWarehouseId(): string | null {
    return this.activeWarehouseIdSubject.value;
  }

  login(email: string, password?: string): Observable<User> {
    if ((environment as any).useSupabase) {
      const headers = {
        'apikey': (environment as any).supabaseKey || '',
        'Authorization': `Bearer ${(environment as any).supabaseKey || ''}`,
      };

      // Save a local login credential hash for offline login fallback verification
      const cacheOfflineCredentials = (emailStr: string, passStr: string, usrObj: User) => {
        try {
          const cacheKey = `dc_off_auth_${emailStr.trim().toLowerCase()}`;
          localStorage.setItem(cacheKey, JSON.stringify({
            username: usrObj.username,
            passHash: passStr, // simple stored string verification for testing
            user: usrObj
          }));
        } catch {}
      };

      return this.http.get<any[]>(`${(environment as any).supabaseUrl}/rest/v1/users?email=eq.${email.trim().toLowerCase()}`, { headers }).pipe(
        map(rows => {
          if (rows && rows.length > 0) {
            const r = rows[0];
            if (password && r.password && r.password !== password) {
              throw new Error('Invalid credentials. Password does not match.');
            }
            const user: User = {
              id: r.id,
              username: r.username,
              email: r.email,
              role: r.role,
              warehouseId: r.warehouse_id || undefined,
              warehouseName: r.warehouse_name || undefined
            };
            this.currentUserSubject.next(user);
            this.activeWarehouseIdSubject.next(user.warehouseId || 'W1');
            localStorage.setItem('dc_current_user', JSON.stringify(user));
            if (password) {
              cacheOfflineCredentials(email, password, user);
            }
            this.db.addLoginLog(user);
            return user;
          } else {
            const demoEmails = [
              'user@warehouse.com', 'manager@warehouse.com', 'admin@delcargo.com',
              'aamir@delcargo.us', 'uzair@delcargo.us', 'alex@delcargo.us'
            ];
            if (demoEmails.includes(email.trim().toLowerCase())) {
              const cleanEmail = email.trim().toLowerCase();
              const isDemoAdmin = cleanEmail.includes('admin') || cleanEmail.includes('aamir');
              const isDemoManager = cleanEmail.includes('manager') || cleanEmail.includes('uzair');
              
              let newId = 'U777';
              let newUsername = 'alex_staff';
              let newRole = 'user';
              let newPass = 'Alex123';
              
              if (isDemoAdmin) {
                newId = 'U999';
                newUsername = 'aamir_admin';
                newRole = 'admin';
                newPass = 'Aamir123';
              } else if (isDemoManager) {
                newId = 'U888';
                newUsername = 'uzair_manager';
                newRole = 'manager';
                newPass = 'Uzair123';
              }
              
              const newUserRow = {
                id: newId,
                username: newUsername,
                email: cleanEmail,
                password: newPass,
                role: newRole,
                warehouse_id: isDemoAdmin ? null : 'W1',
                warehouse_name: isDemoAdmin ? null : 'Warehouse 1'
              };
              
              this.http.post(`${(environment as any).supabaseUrl}/rest/v1/users`, newUserRow, { headers }).subscribe({
                next: () => console.log('Auto-provisioned demo user:', cleanEmail),
                error: (err) => console.error('Failed to auto-provision user:', err)
              });
              
              const user: User = {
                id: newUserRow.id,
                username: newUserRow.username,
                email: newUserRow.email,
                role: newUserRow.role as 'user' | 'manager' | 'admin',
                warehouseId: newUserRow.warehouse_id || undefined,
                warehouseName: newUserRow.warehouse_name || undefined
              };
              this.currentUserSubject.next(user);
              this.activeWarehouseIdSubject.next(user.warehouseId || 'W1');
              localStorage.setItem('dc_current_user', JSON.stringify(user));
              this.db.addLoginLog(user);
              return user;
            }
            throw new Error('User email not registered in Supabase users table.');
          }
        }),
        catchError(err => {
          // Check for offline login cache
          const cacheKey = `dc_off_auth_${email.trim().toLowerCase()}`;
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            try {
              const data = JSON.parse(cached);
              if (password && data.passHash === password) {
                const user = data.user;
                this.currentUserSubject.next(user);
                this.activeWarehouseIdSubject.next(user.warehouseId || 'W1');
                localStorage.setItem('dc_current_user', JSON.stringify(user));
                this.db.addLoginLog(user);
                return of(user);
              }
            } catch {}
          }
          return throwError(() => err);
        })
      );
    }

    if (!environment.useMock) {
      return this.http.post<any>(`${(environment as any).apiUrl}/auth/login`, { email, password }).pipe(
        map(res => {
          const user = res.user || res;
          const token = res.token || res.access_token;
          if (token) {
            localStorage.setItem('dc_auth_token', token);
          }
          this.currentUserSubject.next(user);
          this.activeWarehouseIdSubject.next(user.warehouseId || 'W01');
          localStorage.setItem('dc_current_user', JSON.stringify(user));
          this.db.addLoginLog(user);
          return user;
        })
      );
    }

    return this.db.getUsers().pipe(
      delay(400),
      map(users => {
        const found = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
        if (found) {
          this.currentUserSubject.next(found);
          this.activeWarehouseIdSubject.next(found.warehouseId || 'W01');
          localStorage.setItem('dc_current_user', JSON.stringify(found));
          this.db.addLoginLog(found);
          return found;
        } else {
          throw new Error('User not found. Use user@warehouse.com, manager@warehouse.com, or admin@delcargo.com.');
        }
      })
    );
  }

  logout() {
    this.currentUserSubject.next(null);
    this.activeWarehouseIdSubject.next(null);
    localStorage.removeItem('dc_current_user');
  }

  changeWarehouse(warehouseId: string) {
    if (this.currentUser?.role === 'admin') {
      this.activeWarehouseIdSubject.next(warehouseId);
    }
  }

  private notificationsOpenSubject = new BehaviorSubject<boolean>(false);
  public notificationsOpen$ = this.notificationsOpenSubject.asObservable();

  openNotifications() {
    this.notificationsOpenSubject.next(true);
  }

  closeNotifications() {
    this.notificationsOpenSubject.next(false);
  }

  private menuOpenSubject = new BehaviorSubject<boolean>(false);
  public menuOpen$ = this.menuOpenSubject.asObservable();

  openMenu() {
    this.menuOpenSubject.next(true);
  }

  closeMenu() {
    this.menuOpenSubject.next(false);
  }
}
