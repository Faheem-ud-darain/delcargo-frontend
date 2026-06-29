import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';

export interface OcrResult {
  trackingNumber: string;
  carrier: string;
  rotationNeeded: number; // 0, 90, 180, 270 degrees
}

@Injectable({
  providedIn: 'root'
})
export class OcrService {
  constructor() {}

  // Simulates OCR scan on a selected image file or mock capture
  performOcr(photoBase64: string): Observable<OcrResult> {
    // Generate a random tracking number based on typical carrier formats
    const carriers = ['FedEx', 'UPS', 'Amazon', 'USPS', 'DHL'];
    const selectedCarrier = carriers[Math.floor(Math.random() * carriers.length)];
    let tracking = '';

    if (selectedCarrier === 'FedEx') {
      tracking = Math.floor(100000000000 + Math.random() * 900000000000).toString(); // 12 digits
    } else if (selectedCarrier === 'UPS') {
      tracking = '1Z' + Math.random().toString(36).substring(2, 8).toUpperCase() + '03' + Math.floor(10000000 + Math.random() * 90000000);
    } else if (selectedCarrier === 'Amazon') {
      tracking = 'TBA' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
    } else if (selectedCarrier === 'USPS') {
      tracking = '94001' + Math.floor(10000000000000000 + Math.random() * 90000000000000000).toString();
    } else {
      tracking = 'JD' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    }

    // Auto orientation: simulate that some photos are taken landscape or upside down
    const rotations = [0, 90, 180, 270];
    const selectedRotation = rotations[Math.floor(Math.random() * rotations.length)];

    const result: OcrResult = {
      trackingNumber: tracking,
      carrier: selectedCarrier,
      rotationNeeded: selectedRotation
    };

    // Simulate network delay for OCR server processing (e.g. 1500ms)
    return of(result).pipe(delay(1500));
  }
}
