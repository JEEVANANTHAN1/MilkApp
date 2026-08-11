import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MilkBill, MilkBillDraft } from './models/milk-bill.model';

export type LoadingStage = 'pinging' | 'waking' | 'connecting' | 'fetching' | 'ready' | 'error' | 'offline';

@Injectable({ providedIn: 'root' })
export class MilkBillService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/bills`;
  private readonly healthUrl = `${environment.apiUrl}/health`;

  private readonly bills = signal<MilkBill[]>([]);
  private readonly loading = signal(true);
  private readonly stage = signal<LoadingStage>('pinging');
  private readonly elapsedSec = signal(0);
  private readonly statusMsg = signal('⚡ Contacting Render backend service...');
  private readonly errorMsg = signal<string | null>(null);
  private readonly isOffline = signal(false);

  private timerId: any = null;

  /** All logged bills, most recent bill date first */
  readonly allBills = computed(() =>
    [...this.bills()].sort((a, b) => b.billDate.localeCompare(a.billDate))
  );

  readonly isLoading = computed(() => this.loading());
  readonly loadingStage = computed(() => this.stage());
  readonly elapsedSeconds = computed(() => this.elapsedSec());
  readonly statusMessage = computed(() => this.statusMsg());
  readonly errorMessage = computed(() => this.errorMsg());
  readonly isOfflineMode = computed(() => this.isOffline());

  readonly totalSpent = computed(() =>
    this.bills().reduce((sum, b) => sum + b.totalAmount, 0)
  );

  constructor() {
    this.loadAll();
  }

  /** Reload or start loading process with timer & status updates */
  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.stage.set('pinging');
    this.elapsedSec.set(0);
    this.statusMsg.set('Starting up server…');
    this.startTimer();

    try {
      // First attempt fetching bills (will trigger Render wake-up)
      const all = await firstValueFrom(this.http.get<MilkBill[]>(this.apiUrl));
      this.bills.set(all);
      this.stage.set('ready');
      this.isOffline.set(false);
    } catch (err: any) {
      console.warn('Initial load failed, trying health endpoint retry...', err);
      // Attempt quick retry via health or bills if initial cold-start connection was interrupted
      try {
        const all = await firstValueFrom(this.http.get<MilkBill[]>(this.apiUrl));
        this.bills.set(all);
        this.stage.set('ready');
        this.isOffline.set(false);
      } catch (retryErr: any) {
        this.stage.set('error');
        this.errorMsg.set(
          retryErr?.message || 'Server spin-up timed out or backend is currently unreachable.'
        );
      }
    } finally {
      this.stopTimer();
      if (this.stage() !== 'error') {
        this.loading.set(false);
      }
    }
  }

  /** Trigger manual retry */
  retryConnection(): void {
    this.loadAll();
  }

  /** Continue in offline/cached mode if backend unavailable */
  useOfflineMode(): void {
    this.stopTimer();
    this.isOffline.set(true);
    this.stage.set('offline');
    this.loading.set(false);
    this.errorMsg.set(null);
  }

  private startTimer(): void {
    this.stopTimer();
    this.timerId = setInterval(() => {
      const currentSec = this.elapsedSec() + 1;
      this.elapsedSec.set(currentSec);

      // Dynamically update status message based on Render cold-start timeline (~50s)
      if (currentSec <= 10) {
        this.stage.set('pinging');
        this.statusMsg.set('Starting up server…');
      } else if (currentSec <= 35) {
        this.stage.set('waking');
        this.statusMsg.set('Waking backend service…');
      } else if (currentSec <= 65) {
        this.stage.set('fetching');
        this.statusMsg.set('Loading collection records…');
      } else if (currentSec > 70 && this.loading()) {
        this.stage.set('error');
        this.errorMsg.set('Server response taking longer than expected.');
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  async addBill(draft: MilkBillDraft, imageFile: File | null): Promise<MilkBill> {
    const formData = new FormData();
    formData.append('billDate', draft.billDate);
    formData.append('shift', draft.shift);
    formData.append('quantityLiters', String(draft.quantityLiters));
    formData.append('ratePerLiter', String(draft.ratePerLiter));
    formData.append('totalAmount', String(draft.totalAmount));
    formData.append('fatPercent', String(draft.fatPercent ?? 0));
    if (draft.vendorName) formData.append('vendorName', draft.vendorName);
    if (draft.recipientId) formData.append('recipientId', draft.recipientId);
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
