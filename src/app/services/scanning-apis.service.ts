import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ScanningApisService {

  constructor(public http: HttpClient, private router: Router) { }
  apiUrl = environment.apiUrl;

  login(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        message: 'success',
        data: {
          user: {
            id: 1,
            name: 'Test Operator',
            email: data.email || 'operator@delcargo.com',
            role: 'user'
          },
          token: 'mock-session-jwt-token-998877'
        }
      }).pipe(delay(500));
    }
    let url = `${this.apiUrl}/auth/login`;
    return this.http.post(url, data);
  }
  
  syncReceivedOrder(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        message: 'Mock sync successful'
      }).pipe(delay(300));
    }
    let url = `${this.apiUrl}/warehousing/scanning/save-received-orders`;
    return this.http.post(url, data);
  }

  createGroupReceivedId(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        data: {
          receivedOrder: {
            id: Math.floor(1000 + Math.random() * 9000)
          }
        }
      }).pipe(delay(400));
    }
    let url = `${this.apiUrl}/warehousing/scanning/create-group-received-orders`;
    return this.http.post(url, data);
  }

  getBoxProfilesByUpc(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        data: []
      }).pipe(delay(200));
    }
    let url = `${this.apiUrl}/warehousing/scanning/get-box-profiles-by-upc`;
    return this.http.get(url, { params: data });
  }
  
  getBoxByBoxId(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        data: null
      }).pipe(delay(200));
    }
    let url = `${this.apiUrl}/warehousing/scanning/get-box-by-id`;
    return this.http.get(url, { params: data });
  }
  
  createEmptyBox(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        data: { id: Math.floor(100 + Math.random() * 900) }
      }).pipe(delay(300));
    }
    let url = `${this.apiUrl}/warehousing/scanning/create-empty-box`;
    return this.http.post(url, data);
  }
  
  getPurchaseOrders(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        data: []
      }).pipe(delay(400));
    }
    let url = `${this.apiUrl}/warehousing/table-get-all-purchase-orders`;
    return this.http.get(url, { params: data });
  }
  
  getTenantAccrossStats(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        data: { total: 10, pending: 2, completed: 8 }
      }).pipe(delay(300));
    }
    let url = `${this.apiUrl}/warehousing/get-stats-across-tenants`;
    return this.http.get(url, { params: data });
  }
  
  getMyStats(data: any): Observable<any> {
    if (environment.useMock) {
      return of({
        status: true,
        data: { total: 5, pending: 1, completed: 4 }
      }).pipe(delay(300));
    }
    let url = `${this.apiUrl}/warehousing/get-my-stats`;
    return this.http.get(url, { params: data });
  }
}
