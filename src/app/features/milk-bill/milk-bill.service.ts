import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MilkBill, MilkBillDraft } from './models/milk-bill.model';

const STORAGE_KEY = 'milk_bills_cache';

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

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
    const cached = this.loadLocalBills();
    if (cached.length > 0) {
      this.bills.set(cached);
    }
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
      const local = this.bills();
      const serverIds = new Set(all.map((b) => b.id));
      const unsynced = local.filter((b) => !serverIds.has(b.id));

      if (unsynced.length > 0) {
        await this.syncUnsyncedBills(unsynced);
        try {
          const refreshed = await firstValueFrom(this.http.get<MilkBill[]>(this.apiUrl));
          this.bills.set(refreshed);
          this.saveLocalBills(refreshed);
        } catch {
          this.bills.set(all);
          this.saveLocalBills(all);
        }
      } else {
        this.bills.set(all);
        this.saveLocalBills(all);
      }

      this.stage.set('ready');
      this.isOffline.set(false);
    } catch (err: any) {
      console.warn('Initial load failed, trying health endpoint retry...', err);
      try {
        const all = await firstValueFrom(this.http.get<MilkBill[]>(this.apiUrl));
        this.bills.set(all);
        this.saveLocalBills(all);
        this.stage.set('ready');
        this.isOffline.set(false);
      } catch (retryErr: any) {
        if (this.bills().length > 0) {
          this.useOfflineMode();
        } else {
          this.stage.set('error');
          this.errorMsg.set(
            retryErr?.message || 'Server spin-up timed out or backend is currently unreachable.'
          );
        }
      }
    } finally {
      this.stopTimer();
      if (this.stage() !== 'error') {
        this.loading.set(false);
      }
    }
  }

  private async syncUnsyncedBills(unsynced: MilkBill[]): Promise<void> {
    for (const b of unsynced) {
      try {
        const formData = new FormData();
        formData.append('billDate', b.billDate);
        formData.append('shift', b.shift);
        formData.append('quantityLiters', String(b.quantityLiters));
        formData.append('ratePerLiter', String(b.ratePerLiter));
        formData.append('totalAmount', String(b.totalAmount));
        formData.append('fatPercent', String(b.fatPercent ?? 0));
        if (b.recipientId) formData.append('recipientId', b.recipientId);
        if (b.snfPercent != null) formData.append('snfPercent', String(b.snfPercent));
        if (b.notes) formData.append('notes', b.notes);

        await firstValueFrom(this.http.post<MilkBill>(this.apiUrl, formData));
      } catch (err) {
        console.warn(`Failed to sync local bill ${b.id} to server:`, err);
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
        if (this.bills().length > 0) {
          this.useOfflineMode();
        } else {
          this.stage.set('error');
          this.errorMsg.set('Server response taking longer than expected.');
        }
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
    if (draft.recipientId) formData.append('recipientId', draft.recipientId);
    if (draft.snfPercent != null) formData.append('snfPercent', String(draft.snfPercent));
    if (draft.notes) formData.append('notes', draft.notes);
    if (imageFile) formData.append('image', imageFile);

    if (!this.isOfflineMode()) {
      try {
        const created = await firstValueFrom(this.http.post<MilkBill>(this.apiUrl, formData));
        this.bills.update((current) => [...current, created]);
        this.saveLocalBills(this.bills());
        return created;
      } catch (err) {
        console.warn('Backend save failed, saving bill locally as fallback...', err);
      }
    }

    // Fallback: save locally
    const fallbackCreated: MilkBill = {
      id: generateUuid(),
      ...draft,
      createdAt: new Date().toISOString(),
    };
    this.bills.update((current) => [...current, fallbackCreated]);
    this.saveLocalBills(this.bills());
    return fallbackCreated;
  }

  async updateBill(id: string, draft: MilkBillDraft, imageFile: File | null): Promise<MilkBill> {
    const formData = new FormData();
    formData.append('billDate', draft.billDate);
    formData.append('shift', draft.shift);
    formData.append('quantityLiters', String(draft.quantityLiters));
    formData.append('ratePerLiter', String(draft.ratePerLiter));
    formData.append('totalAmount', String(draft.totalAmount));
    formData.append('fatPercent', String(draft.fatPercent ?? 0));
    if (draft.recipientId) formData.append('recipientId', draft.recipientId);
    if (draft.snfPercent != null) formData.append('snfPercent', String(draft.snfPercent));
    if (draft.notes) formData.append('notes', draft.notes);
    if (imageFile) formData.append('image', imageFile);

    if (!this.isOfflineMode()) {
      try {
        const updated = await firstValueFrom(this.http.put<MilkBill>(`${this.apiUrl}/${id}`, formData));
        this.bills.update((current) => current.map((b) => (b.id === id ? updated : b)));
        this.saveLocalBills(this.bills());
        return updated;
      } catch (err) {
        console.warn('Backend update failed, updating bill locally as fallback...', err);
      }
    }

    // Fallback: update locally
    let fallbackUpdated: MilkBill | undefined;
    this.bills.update((current) =>
      current.map((b) => {
        if (b.id === id) {
          fallbackUpdated = { ...b, ...draft };
          return fallbackUpdated;
        }
        return b;
      })
    );
    this.saveLocalBills(this.bills());
    return fallbackUpdated || { id, ...draft, createdAt: new Date().toISOString() };
  }

  getBillById(id: string): MilkBill | undefined {
    return this.allBills().find((b) => b.id === id);
  }

  async deleteBill(id: string): Promise<void> {
    if (!this.isOfflineMode()) {
      try {
        await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/${id}`));
      } catch (err) {
        console.warn('Backend delete failed, deleting bill locally...', err);
      }
    }
    this.bills.update((current) => current.filter((b) => b.id !== id));
    this.saveLocalBills(this.bills());
  }

  private loadLocalBills(): MilkBill[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private saveLocalBills(list: MilkBill[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('Could not save bills to localStorage', err);
    }
  }
}
