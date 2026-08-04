import { Injectable, signal, computed } from '@angular/core';
import { MilkBill, MilkBillDraft } from './models/milk-bill.model';

const DB_NAME = 'milk-bill-recorder';
const DB_VERSION = 1;
const STORE_NAME = 'bills';

/**
 * Minimal promise-based IndexedDB wrapper.
 * Kept dependency-free on purpose — no external libs required.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('billDate', 'billDate', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

@Injectable({ providedIn: 'root' })
export class MilkBillService {
  private readonly bills = signal<MilkBill[]>([]);
  private dbReady: Promise<IDBDatabase> | null = null;
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

  private async getDb(): Promise<IDBDatabase> {
    if (!this.dbReady) {
      this.dbReady = openDb();
    }
    return this.dbReady;
  }

  private async loadAll(): Promise<void> {
    try {
      const db = await this.getDb();
      const all = await new Promise<MilkBill[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as MilkBill[]);
        req.onerror = () => reject(req.error);
      });
      this.bills.set(all);
    } finally {
      this.loading.set(false);
    }
  }

  async addBill(draft: MilkBillDraft): Promise<MilkBill> {
    const bill: MilkBill = {
      ...draft,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    const db = await this.getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).add(bill);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    this.bills.update((current) => [...current, bill]);
    return bill;
  }

  async deleteBill(id: string): Promise<void> {
    const db = await this.getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    this.bills.update((current) => current.filter((b) => b.id !== id));
  }
}
