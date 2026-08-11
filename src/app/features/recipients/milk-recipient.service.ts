import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MilkRecipient } from './models/milk-recipient.model';

const STORAGE_KEY = 'milk_recipients_master';

const DEFAULT_RECIPIENTS: MilkRecipient[] = [
  { id: 'rec-1', name: 'Milkymist Society', status: 'Active', createdAt: new Date().toISOString() },
  { id: 'rec-2', name: 'Mani', status: 'Active', createdAt: new Date().toISOString() },
  { id: 'rec-3', name: 'Kumar', status: 'Active', createdAt: new Date().toISOString() },
  { id: 'rec-4', name: 'Local Milk Shop', status: 'Active', createdAt: new Date().toISOString() },
];

@Injectable({ providedIn: 'root' })
export class MilkRecipientService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/recipients`;

  private readonly recipients = signal<MilkRecipient[]>([]);
  private readonly loading = signal(false);

  /** All recipients sorted by name */
  readonly allRecipients = computed(() =>
    [...this.recipients()].sort((a, b) => a.name.localeCompare(b.name))
  );

  /** Only Active recipients */
  readonly activeRecipients = computed(() =>
    this.allRecipients().filter((r) => r.status === 'Active')
  );

  readonly isLoading = computed(() => this.loading());

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    // Load local cache first
    const cached = this.loadLocalCache();
    if (cached.length > 0) {
      this.recipients.set(cached);
    } else {
      this.recipients.set(DEFAULT_RECIPIENTS);
      this.saveLocalCache(DEFAULT_RECIPIENTS);
    }

    // Try syncing with API
    try {
      const serverData = await firstValueFrom(this.http.get<MilkRecipient[]>(this.apiUrl));
      if (serverData && serverData.length > 0) {
        this.recipients.set(serverData);
        this.saveLocalCache(serverData);
      }
    } catch (err) {
      console.info('API sync for recipients unavailable, operating with local cache.', err);
    } finally {
      this.loading.set(false);
    }
  }

  async addRecipient(name: string, status: 'Active' | 'Inactive' = 'Active'): Promise<MilkRecipient> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Recipient name cannot be empty');

    const newRecipient: MilkRecipient = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}`,
      name: trimmed,
      status,
      createdAt: new Date().toISOString(),
    };

    // Update local state immediately
    this.recipients.update((current) => [...current, newRecipient]);
    this.saveLocalCache(this.recipients());

    // Sync to API in background
    try {
      const created = await firstValueFrom(this.http.post<MilkRecipient>(this.apiUrl, newRecipient));
      if (created) {
        this.recipients.update((current) =>
          current.map((r) => (r.id === newRecipient.id ? created : r))
        );
        this.saveLocalCache(this.recipients());
        return created;
      }
    } catch (err) {
      console.warn('Could not sync created recipient to backend, saved locally.', err);
    }

    return newRecipient;
  }

  async updateRecipient(id: string, name: string, status: 'Active' | 'Inactive'): Promise<MilkRecipient> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Recipient name cannot be empty');

    let updated: MilkRecipient | null = null;

    this.recipients.update((current) =>
      current.map((r) => {
        if (r.id === id) {
          updated = { ...r, name: trimmed, status };
          return updated;
        }
        return r;
      })
    );
    this.saveLocalCache(this.recipients());

    if (updated) {
      try {
        await firstValueFrom(this.http.put<void>(`${this.apiUrl}/${id}`, updated));
      } catch (err) {
        console.warn('Could not sync updated recipient to backend, saved locally.', err);
      }
    }

    return updated ?? { id, name: trimmed, status };
  }

  async toggleStatus(id: string): Promise<void> {
    const current = this.recipients().find((r) => r.id === id);
    if (!current) return;

    const newStatus: 'Active' | 'Inactive' = current.status === 'Active' ? 'Inactive' : 'Active';
    await this.updateRecipient(id, current.name, newStatus);
  }

  private loadLocalCache(): MilkRecipient[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveLocalCache(list: MilkRecipient[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('Could not save recipients to localStorage', err);
    }
  }
}
