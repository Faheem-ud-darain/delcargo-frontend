import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffPage } from './staff.page';
import { StaffPageRoutingModule } from './staff-routing.module';

@NgModule({
  imports: [IonicModule, CommonModule, FormsModule, StaffPageRoutingModule],
  declarations: [StaffPage]
})
export class StaffPageModule {}
