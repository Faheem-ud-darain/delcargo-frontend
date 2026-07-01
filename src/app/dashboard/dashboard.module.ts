import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardPage } from './dashboard.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { DashboardPageRoutingModule } from './dashboard-routing.module';
import { CarrierBadgeComponent } from '../shared/carrier-badge/carrier-badge.component';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    DashboardPageRoutingModule,
    CarrierBadgeComponent
  ],
  declarations: [DashboardPage]
})
export class DashboardPageModule {}
