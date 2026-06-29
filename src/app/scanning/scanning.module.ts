import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScanningPage } from './scanning.page';
import { ScanningPageRoutingModule } from './scanning-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ScanningPageRoutingModule
  ],
  declarations: [ScanningPage]
})
export class ScanningPageModule {}
