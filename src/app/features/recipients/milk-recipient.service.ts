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
    this.loadRecipients();
  }

  /** Always load recipients directly from the database API */
  async loadRecipients(): Promise<void> {
    this.loading.set(true);

    // Show local cache temporarily while network request is in flight
    const cached = this.loadLocalCache();
    if (cached.length > 0) {
      this.recipients.set(cached);
    }

    try {
      const serverData = await firstValueFrom(this.http.get<MilkRecipient[]>(this.apiUrl));
      if (serverData && Array.isArray(serverData)) {
        this.recipients.set(serverData);
        this.saveLocalCache(serverData);
      }
    } catch (err) {
      console.warn('Could not fetch recipients from DB API, using local backup cache.', err);
    } finally {
      this.loading.set(false);
    }
  }

  /** Add a recipient directly to Supabase DB */
  async addRecipient(name: string, status: 'Active' | 'Inactive' = 'Active'): Promise<MilkRecipient> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Recipient name cannot be empty');

    const payload = {
      name: trimmed,
      status,
    };

    try {
      const created = await firstValueFrom(this.http.post<MilkRecipient>(this.apiUrl, payload));
      if (created) {
        this.recipients.update((current) => [...current, created]);
        this.saveLocalCache(this.recipients());
        return created;
      }
    } catch (err) {
      console.error('Failed to create recipient in DB:', err);
      throw err;
    }

    throw new Error('Failed to create recipient in DB');
  }

  /** Update a recipient directly in Supabase DB */
  async updateRecipient(id: string, name: string, status: 'Active' | 'Inactive'): Promise<MilkRecipient> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Recipient name cannot be empty');

    const updatedRecipient: MilkRecipient = {
      id,
      name: trimmed,
      status,
      createdAt: new Date().toISOString(),
    };

    try {
      await firstValueFrom(this.http.put<void>(`${this.apiUrl}/${id}`, updatedRecipient));
      this.recipients.update((current) =>
        current.map((r) => (r.id === id ? { ...r, name: trimmed, status } : r))
      );
      this.saveLocalCache(this.recipients());
      return updatedRecipient;
    } catch (err) {
      console.error('Failed to update recipient in DB:', err);
      throw err;
    }
  }

  async toggleStatus(id: string): Promise<void> {
    const current = this.recipients().find((r) => r.id === id);
    if (!current) return;

    const newStatus: 'Active' | 'Inactive' = current.status === 'Active' ? 'Inactive' : 'Active';
    await this.updateRecipient(id, current.name, newStatus);
  }

  /** Delete a recipient directly from Supabase DB */
  async deleteRecipient(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete<void>(`${this.apiUrl}/${id}`));
      this.recipients.update((current) => current.filter((r) => r.id !== id));
      this.saveLocalCache(this.recipients());
    } catch (err) {
      console.error('Failed to delete recipient from DB:', err);
      throw err;
    }
  }

  async getRecipientById(id: string): Promise<MilkRecipient | null> {
    if (isValidGuid(id)) {
      try {
        return await firstValueFrom(this.http.get<MilkRecipient>(`${this.apiUrl}/${id}`));
      } catch {
        // Fallback to local signal
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
