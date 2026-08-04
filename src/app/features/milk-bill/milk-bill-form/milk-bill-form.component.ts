import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MilkBillService } from '../milk-bill.service';
import { MilkBillDraft } from '../models/milk-bill.model';
import { OcrService } from '../ocr.service';
import { parseBillText } from '../utils/bill-text-parser';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-milk-bill-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './milk-bill-form.component.html',
  styleUrl: './milk-bill-form.component.scss',
})
export class MilkBillFormComponent {
  private readonly milkBillService = inject(MilkBillService);
  private readonly ocrService = inject(OcrService);
  private readonly router = inject(Router);

  imageDataUrl = signal<string | null>(null);
  billDate = signal<string>(todayIso());
  quantityLiters = signal<number | null>(null);
  ratePerLiter = signal<number | null>(null);
  totalAmountOverride = signal<number | null>(null);
  vendorName = signal<string>('');
  notes = signal<string>('');

  isSaving = signal(false);
  errorMessage = signal<string | null>(null);

  isExtracting = signal(false);
  /** Which fields were auto-filled from OCR, so the template can show a "detected" hint */
  autoFilledFields = signal<Set<'billDate' | 'quantityLiters' | 'ratePerLiter' | 'totalAmount' | 'vendorName'>>(new Set());
  extractionMessage = signal<string | null>(null);

  computedTotal = computed(() => {
    const qty = this.quantityLiters();
    const rate = this.ratePerLiter();
    if (qty == null || rate == null) return null;
    return Math.round(qty * rate * 100) / 100;
  });

  /** What actually gets saved — override wins if the user typed one in */
  effectiveTotal = computed(() => this.totalAmountOverride() ?? this.computedTotal());

  canSave = computed(() => {
    return (
      !!this.imageDataUrl() &&
      this.quantityLiters() != null &&
      this.quantityLiters()! > 0 &&
      this.ratePerLiter() != null &&
      this.ratePerLiter()! > 0 &&
      !!this.billDate()
    );
  });

  async onImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.errorMessage.set(null);
    this.extractionMessage.set(null);

    try {
      const dataUrl = await this.fileToDataUrl(file);
      this.imageDataUrl.set(dataUrl);
    } catch {
      this.errorMessage.set('Could not read that image. Please try again.');
      return;
    }

    await this.extractFieldsFromImage(file);
  }

  private async extractFieldsFromImage(file: File): Promise<void> {
    this.isExtracting.set(true);
    try {
      const text = await this.ocrService.extractText(file);
      const parsed = parseBillText(text);
      const filled = new Set<'billDate' | 'quantityLiters' | 'ratePerLiter' | 'totalAmount' | 'vendorName'>();

      if (parsed.billDate) {
        this.billDate.set(parsed.billDate);
        filled.add('billDate');
      }
      if (parsed.quantityLiters !== null) {
        this.quantityLiters.set(parsed.quantityLiters);
        filled.add('quantityLiters');
      }
      if (parsed.ratePerLiter !== null) {
        this.ratePerLiter.set(parsed.ratePerLiter);
        filled.add('ratePerLiter');
      }
      if (parsed.totalAmount !== null) {
        this.totalAmountOverride.set(parsed.totalAmount);
        filled.add('totalAmount');
      }
      if (parsed.vendorName && !this.vendorName()) {
        this.vendorName.set(parsed.vendorName);
        filled.add('vendorName');
      }

      this.autoFilledFields.set(filled);
      this.extractionMessage.set(
        filled.size > 0
          ? 'Auto-filled from the image — please double-check before saving.'
          : "Couldn't confidently read details from that image. Please fill the fields in manually."
      );
    } catch {
      this.extractionMessage.set("Couldn't scan that image for text. Please fill the fields in manually.");
    } finally {
      this.isExtracting.set(false);
    }
  }

  clearImage(): void {
    this.imageDataUrl.set(null);
    this.extractionMessage.set(null);
    this.autoFilledFields.set(new Set());
  }

  updateBillDate(value: string): void {
    this.billDate.set(value);
    this.unmarkAutoFilled('billDate');
  }

  updateQuantity(value: number | null): void {
    this.quantityLiters.set(value);
    this.unmarkAutoFilled('quantityLiters');
  }

  updateRate(value: number | null): void {
    this.ratePerLiter.set(value);
    this.unmarkAutoFilled('ratePerLiter');
  }

  updateVendorName(value: string): void {
    this.vendorName.set(value);
    this.unmarkAutoFilled('vendorName');
  }

  onTotalOverrideChange(value: string): void {
    this.totalAmountOverride.set(value === '' ? null : Number(value));
    this.unmarkAutoFilled('totalAmount');
  }

  isAutoFilled(field: 'billDate' | 'quantityLiters' | 'ratePerLiter' | 'totalAmount' | 'vendorName'): boolean {
    return this.autoFilledFields().has(field);
  }

  private unmarkAutoFilled(field: 'billDate' | 'quantityLiters' | 'ratePerLiter' | 'totalAmount' | 'vendorName'): void {
    if (!this.autoFilledFields().has(field)) return;
    const next = new Set(this.autoFilledFields());
    next.delete(field);
    this.autoFilledFields.set(next);
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.isSaving()) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const draft: MilkBillDraft = {
      billDate: this.billDate(),
      quantityLiters: this.quantityLiters()!,
      ratePerLiter: this.ratePerLiter()!,
      totalAmount: this.effectiveTotal()!,
      vendorName: this.vendorName().trim() || undefined,
      notes: this.notes().trim() || undefined,
      imageDataUrl: this.imageDataUrl()!,
    };

    try {
      await this.milkBillService.addBill(draft);
      this.router.navigate(['/milk-bills']);
    } catch {
      this.errorMessage.set('Could not save the bill. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }

  private fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
