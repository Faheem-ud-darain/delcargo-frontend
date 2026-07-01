import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LedgerPage } from './ledger.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { LedgerPageRoutingModule } from './ledger-routing.module';
import { CarrierBadgeComponent } from '../shared/carrier-badge/carrier-badge.component';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    LedgerPageRoutingModule,
    CarrierBadgeComponent
  ],
  declarations: [LedgerPage]
})
export class LedgerPageModule {}
