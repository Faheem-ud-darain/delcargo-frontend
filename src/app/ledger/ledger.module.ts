import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LedgerPage } from './ledger.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { LedgerPageRoutingModule } from './ledger-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    LedgerPageRoutingModule
  ],
  declarations: [LedgerPage]
})
export class LedgerPageModule {}
