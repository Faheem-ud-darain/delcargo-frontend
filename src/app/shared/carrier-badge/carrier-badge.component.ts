import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// Real brand logos. FedEx/UPS/USPS come from Simple Icons (CC0-licensed) via
// jsDelivr CDN. OnTrac/DHL/Target/Amazon/Walmart/Roadie were supplied
// directly and are bundled locally under src/assets/carrier-logos so they
// keep working with no signal in the warehouse. LaserShip is still pending —
// no usable file was provided for it yet.
// Everything not listed here falls back to the colored-initials badge below.
// If a logo request fails (offline CDN, missing file), the (error) handler
// on the <img> also falls back to the initials badge automatically.
const CARRIER_LOGO_URLS: Record<string, string> = {
  fedex: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/fedex.svg',
  ups: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/ups.svg',
  usps: 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/usps.svg',
  ontrac: 'assets/carrier-logos/ontrac.svg',
  dhl: 'assets/carrier-logos/dhl.svg',
  'dhl-express': 'assets/carrier-logos/dhl.svg',
  'dhl-ecommerce': 'assets/carrier-logos/dhl.svg',
  target: 'assets/carrier-logos/target.svg',
  amazon: 'assets/carrier-logos/amazon.svg',
  'amazon-logistics': 'assets/carrier-logos/amazon.svg',
  wallmart: 'assets/carrier-logos/walmart.svg',
  walmart: 'assets/carrier-logos/walmart.svg',
  roadie: 'assets/carrier-logos/roadie.svg',
};

// Logos that already ship with their own full-bleed background (DHL's
// yellow square is part of the brand mark) shouldn't get the badge's usual
// white-circle padding — they should fill the circle edge-to-edge instead.
const FULL_BLEED_CARRIERS = new Set(['dhl', 'dhl-express', 'dhl-ecommerce']);

@Component({
  selector: 'app-carrier-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="carrier-badge-wrap"
      [ngClass]="carrierClass"
      [class.has-logo]="logoUrl && !logoFailed"
      [class.full-bleed]="isFullBleed"
      [style.width.px]="size"
      [style.height.px]="size"
      [style.fontSize.px]="fontSize"
    >
      <img
        *ngIf="logoUrl && !logoFailed"
        [src]="logoUrl"
        [alt]="carrier"
        (error)="logoFailed = true"
      />
      <span *ngIf="!logoUrl || logoFailed">{{ initials }}</span>
    </div>
  `,
  styles: [`
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    .carrier-badge-wrap {
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-weight: 800;
      text-transform: uppercase;
      color: #fff;
      overflow: hidden;
    }
    .carrier-badge-wrap.has-logo {
      background: #ffffff !important;
      border: 1px solid rgba(0, 0, 0, 0.08);
      padding: 18%;
      box-sizing: border-box;
    }
    .carrier-badge-wrap.has-logo.full-bleed {
      padding: 0;
      border: none;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .fedex   { background: #4B2989; }
    .ups     { background: #ffaa00; color: #111; }
    .amazon, .amazon-logistics { background: #232f3e; }
    .usps    { background: #3880FF; }
    .dhl, .dhl-express, .dhl-ecommerce { background: #F44336; }
    .ontrac  { background: #005a9c; }
    .roadie  { background: #e21a22; }
    .wallmart, .walmart { background: #0071ce; }
    .lasership { background: #2e7d32; }
    .target  { background: #cc0000; }
    .s10     { background: #616161; }
    .other   { background: #72727a; }
  `]
})
export class CarrierBadgeComponent {
  @Input() carrier: string = '';
  @Input() size: number = 36;

  logoFailed = false;

  get carrierClass(): string {
    return (this.carrier || '').toLowerCase().replace(/\s+/g, '-');
  }

  get initials(): string {
    return (this.carrier || '??').substring(0, 2).toUpperCase();
  }

  get fontSize(): number {
    return Math.max(9, Math.round(this.size * 0.3));
  }

  get logoUrl(): string | null {
    return CARRIER_LOGO_URLS[(this.carrier || '').toLowerCase()] || null;
  }

  get isFullBleed(): boolean {
    return FULL_BLEED_CARRIERS.has((this.carrier || '').toLowerCase());
  }
}
