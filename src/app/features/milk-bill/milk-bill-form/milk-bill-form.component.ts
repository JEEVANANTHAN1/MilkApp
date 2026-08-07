import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MilkBillService } from '../milk-bill.service';
import { MilkBillDraft } from '../models/milk-bill.model';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns 'Morning' if before noon, 'Evening' otherwise. */
function defaultShift(): 'Morning' | 'Evening' {
  return new Date().getHours() < 12 ? 'Morning' : 'Evening';
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
  private readonly router = inject(Router);

  /** Local base64 preview only — never sent to the server */
  imagePreviewUrl = signal<string | null>(null);
  /** Raw selected file — uploaded to the server on save */
  selectedImageFile = signal<File | null>(null);
  billDate = signal<string>(todayIso());
  /** Morning/Evening — auto-defaults by time of day but the user can change it manually */
  shift = signal<'Morning' | 'Evening'>(defaultShift());
  quantityLiters = signal<number | null>(null);
  ratePerLiter = signal<number | null>(null);
  totalAmountOverride = signal<number | null>(null);
  vendorName = signal<string>('');
  fatPercent = signal<number | null>(null);
  snfPercent = signal<number | null>(null);
  memberCode = signal<string>('');
  memberName = signal<string>('');
  notes = signal<string>('');

  isSaving = signal(false);
  errorMessage = signal<string | null>(null);

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
    this.selectedImageFile.set(file);

    try {
      const dataUrl = await this.fileToDataUrl(file);
      this.imagePreviewUrl.set(dataUrl);
    } catch {
      this.errorMessage.set('Could not read that image. Please try again.');
    }
  }

  clearImage(): void {
    this.imagePreviewUrl.set(null);
    this.selectedImageFile.set(null);
  }

  updateBillDate(value: string): void {
    this.billDate.set(value);
  }

  updateShift(value: 'Morning' | 'Evening'): void {
    this.shift.set(value);
  }

  updateQuantity(value: number | null): void {
    this.quantityLiters.set(value);
  }

  updateRate(value: number | null): void {
    this.ratePerLiter.set(value);
  }

  updateVendorName(value: string): void {
    this.vendorName.set(value);
  }

  updateFatPercent(value: number | null): void {
    this.fatPercent.set(value);
  }

  updateSnfPercent(value: number | null): void {
    this.snfPercent.set(value);
  }

  updateMemberCode(value: string): void {
    this.memberCode.set(value);
  }

  updateMemberName(value: string): void {
    this.memberName.set(value);
  }

  onTotalOverrideChange(value: string): void {
    this.totalAmountOverride.set(value === '' ? null : Number(value));
  }

  async save(): Promise<void> {
    if (!this.canSave() || this.isSaving()) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const draft: MilkBillDraft = {
      billDate: this.billDate(),
      shift: this.shift(),
      quantityLiters: this.quantityLiters()!,
      ratePerLiter: this.ratePerLiter()!,
      totalAmount: this.effectiveTotal()!,
      vendorName: this.vendorName().trim() || undefined,
      fatPercent: this.fatPercent() ?? undefined,
      snfPercent: this.snfPercent() ?? undefined,
      memberCode: this.memberCode().trim() || undefined,
      memberName: this.memberName().trim() || undefined,
      notes: this.notes().trim() || undefined,
    };

    try {
      await this.milkBillService.addBill(draft, this.selectedImageFile());
      this.router.navigate(['/bills']);
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

