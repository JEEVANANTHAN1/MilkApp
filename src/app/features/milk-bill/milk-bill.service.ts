import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MilkBill, MilkBillDraft } from './models/milk-bill.model';

@Injectable({ providedIn: 'root' })
export class MilkBillService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/bills`;

  private readonly bills = signal<MilkBill[]>([]);
  private readonly loading = signal(true);

  /** All logged bills, most recent bill date first */
  readonly allBills = computed(() =>
    [...this.bills()].sort((a, b) => b.billDate.localeCompare(a.billDate))
  );

  readonly isLoading = computed(() => this.loading());

  readonly totalSpent = computed(() =>
    this.bills().reduce((sum, b) => sum + b.totalAmount, 0)
  );

  constructor() {
    this.loadAll();
  }

  private async loadAll(): Promise<void> {
    try {
      const all = await firstValueFrom(this.http.get<MilkBill[]>(this.apiUrl));
      this.bills.set(all);
    } finally {
      this.loading.set(false);
    }
  }

  async addBill(draft: MilkBillDraft, imageFile: File | null): Promise<MilkBill> {
    const formData = new FormData();
    formData.append('billDate', draft.billDate);
    formData.append('quantityLiters', String(draft.quantityLiters));
    formData.append('ratePerLiter', String(draft.ratePerLiter));
    formData.append('totalAmount', String(draft.totalAmount));
    formData.append('fatPercent', String(draft.fatPercent ?? 0));
    if (draft.vendorName) formData.append('vendorName', draft.vendorName);
    if (draft.snfPercent != null) formData.append('snfPercent', String(draft.snfPercent));
    if (draft.memberCode) formData.append('memberCode', draft.memberCode);
    if (draft.memberName) formData.append('memberName', draft.memberName);
    if (draft.notes) formData.append('notes', draft.notes);
    if (imageFile) formData.append('image', imageFile);

    const created = await firstValueFrom(this.http.post<MilkBill>(this.apiUrl, formData));
    this.bills.update((current) => [...current, created]);
    return created;
  }

  async deleteBill(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/${id}`));
    this.bills.update((current) => current.filter((b) => b.id !== id));
  }
}
