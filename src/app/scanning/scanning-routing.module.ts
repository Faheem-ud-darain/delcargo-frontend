import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ScanningPage } from './scanning.page';

const routes: Routes = [
  { path: '', component: ScanningPage }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ScanningPageRoutingModule {}
