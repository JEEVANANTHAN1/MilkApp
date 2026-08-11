import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MilkBillService } from '../milk-bill.service';
import { MilkBillDraft } from '../models/milk-bill.model';

import { MilkRecipientService } from '../../recipients/milk-recipient.service';

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
  protected readonly recipientService = inject(MilkRecipientService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  editingId = signal<string | null>(null);
  isEditMode = computed(() => !!this.editingId());

  /** Local base64 preview only — never sent to the server */
  imagePreviewUrl = signal<string | null>(null);
  /** Raw selected file — uploaded to the server on save */
  selectedImageFile = signal<File | null>(null);
  billDate = signal<string>(todayIso());
  /** Morning/Evening — auto-defaults by time of day but the user can change it manually */
  shift = signal<'Morning' | 'Evening'>(defaultShift());
  /** Master record ID of selected milk recipient */
  recipientId = signal<string>('');
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

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editingId.set(id);
      const bill = this.milkBillService.getBillById(id);
      if (bill) {
        this.billDate.set(bill.billDate);
        this.shift.set(bill.shift);
        if (bill.recipientId) this.recipientId.set(bill.recipientId);
        this.quantityLiters.set(bill.quantityLiters);
        this.ratePerLiter.set(bill.ratePerLiter);
        this.totalAmountOverride.set(bill.totalAmount);
        if (bill.vendorName) this.vendorName.set(bill.vendorName);
        if (bill.fatPercent != null) this.fatPercent.set(bill.fatPercent);
        if (bill.snfPercent != null) this.snfPercent.set(bill.snfPercent);
        if (bill.memberCode) this.memberCode.set(bill.memberCode);
        if (bill.memberName) this.memberName.set(bill.memberName);
        if (bill.notes) this.notes.set(bill.notes);
        if (bill.imageUrl) this.imagePreviewUrl.set(bill.imageUrl);
      }
    }
  }

  /** Active recipients list for dropdown selection */
  activeRecipients = this.recipientService.activeRecipients;

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
      !!this.billDate() &&
      !!this.recipientId()
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

  updateRecipientId(value: string): void {
    this.recipientId.set(value);
    const selected = this.activeRecipients().find((r) => r.id === value);
    if (selected && !this.vendorName()) {
      this.vendorName.set(selected.name);
    }
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

    const selectedRecipient = this.activeRecipients().find((r) => r.id === this.recipientId());
    const resolvedVendorName = this.vendorName().trim() || selectedRecipient?.name;

    const draft: MilkBillDraft = {
      billDate: this.billDate(),
      shift: this.shift(),
      quantityLiters: this.quantityLiters()!,
      ratePerLiter: this.ratePerLiter()!,
      totalAmount: this.effectiveTotal()!,
      recipientId: this.recipientId() || undefined,
      vendorName: resolvedVendorName || undefined,
      fatPercent: this.fatPercent() ?? undefined,
      snfPercent: this.snfPercent() ?? undefined,
      memberCode: this.memberCode().trim() || undefined,
      memberName: this.memberName().trim() || undefined,
      notes: this.notes().trim() || undefined,
    };

    try {
      if (this.isEditMode() && this.editingId()) {
        await this.milkBillService.updateBill(this.editingId()!, draft, this.selectedImageFile());
      } else {
        await this.milkBillService.addBill(draft, this.selectedImageFile());
      }
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

