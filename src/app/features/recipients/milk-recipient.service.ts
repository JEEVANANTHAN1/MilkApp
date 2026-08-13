import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MilkRecipient } from './models/milk-recipient.model';

const STORAGE_KEY = 'milk_recipients_master';

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

function isValidGuid(id: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
}

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
      this.recipients.set([]);
    }

    // Try syncing with API
    try {
      const serverData = await firstValueFrom(this.http.get<MilkRecipient[]>(this.apiUrl));
      if (serverData && Array.isArray(serverData)) {
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
      id: generateUuid(),
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

    if (updated && isValidGuid(id)) {
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

  async deleteRecipient(id: string): Promise<void> {
    this.recipients.update((current) => current.filter((r) => r.id !== id));
    this.saveLocalCache(this.recipients());

    if (isValidGuid(id)) {
      try {
        await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/${id}`));
      } catch (err) {
        console.warn('Could not sync deleted recipient to backend, deleted locally.', err);
      }
    }
  }

  async getRecipientById(id: string): Promise<MilkRecipient | null> {
    if (isValidGuid(id)) {
      try {
        return await firstValueFrom(this.http.get<MilkRecipient>(`${this.apiUrl}/${id}`));
      } catch {
        // Fallback to local cache
      }
    }
    return this.recipients().find((r) => r.id === id) || null;
  }

  async getRecipientSummary(id: string, month?: string): Promise<any | null> {
    if (isValidGuid(id)) {
      try {
        const query = month ? `?month=${month}` : '';
        return await firstValueFrom(this.http.get<any>(`${this.apiUrl}/${id}/summary${query}`));
      } catch {
        // Fallback handled in component
      }
    }
    return null;
  }

  private loadLocalCache(): MilkRecipient[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const list: MilkRecipient[] = JSON.parse(raw);
      // Filter out any stale non-UUID items from previous dev builds
      const validList = list.filter((item) => isValidGuid(item.id));
      return validList;
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
