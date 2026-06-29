import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuController } from '@ionic/angular';
import { AuthService } from './services/auth.service';
import { User } from './services/mock-db.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  user: User | null = null;
  menuOpen: boolean = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private menuCtrl: MenuController
  ) {}

  ngOnInit() {
    this.auth.currentUser$.subscribe(user => {
      this.user = user;
      if (!user) {
        this.router.navigate(['/login']);
      }
    });
  }

  onMenuOpen() {
    this.menuOpen = true;
  }

  onMenuClose() {
    this.menuOpen = false;
  }

  logout() {
    this.menuCtrl.close('main-menu').then(() => {
      this.auth.logout();
      this.router.navigate(['/login']);
    });
  }
}
