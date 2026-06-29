import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { delay, map } from 'rxjs/operators';
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
    if (!environment.useMock) {
      return this.http.post<any>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
        map(res => {
          const user = res.user || res;
          const token = res.token || res.access_token;
          if (token) {
            localStorage.setItem('dc_auth_token', token);
          }
          this.currentUserSubject.next(user);
          this.activeWarehouseIdSubject.next(user.warehouseId || 'W01');
          localStorage.setItem('dc_current_user', JSON.stringify(user));
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
