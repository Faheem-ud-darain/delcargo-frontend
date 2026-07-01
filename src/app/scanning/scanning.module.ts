import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScanningPage } from './scanning.page';
import { ScanningPageRoutingModule } from './scanning-routing.module';
import { CarrierBadgeComponent } from '../shared/carrier-badge/carrier-badge.component';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ScanningPageRoutingModule,
    CarrierBadgeComponent
  ],
  declarations: [ScanningPage]
})
export class ScanningPageModule {}
