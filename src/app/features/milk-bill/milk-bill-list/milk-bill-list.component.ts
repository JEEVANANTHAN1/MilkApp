import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MilkBillService } from '../milk-bill.service';
import { MilkBill } from '../models/milk-bill.model';

export interface RecipientGroup {
  groupKey: string;
  recipientName: string;
  totalLiters: number;
  totalAmount: number;
  bills: MilkBill[];
}

export interface DateGroup {
  date: string;
  formattedDate: string;
  totalLiters: number;
  totalAmount: number;
  recipientGroups: RecipientGroup[];
}

function formatDateLabel(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(d);
    targetDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 0) return `Today, ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
    if (diffDays === 1) return `Yesterday, ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;

    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

@Component({
  selector: 'app-milk-bill-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './milk-bill-list.component.html',
  styleUrl: './milk-bill-list.component.scss',
})
export class MilkBillListComponent {
  readonly milkBillService = inject(MilkBillService);
  private readonly router = inject(Router);

  expandedGroupKey = signal<string | null>(null);
  searchQuery = signal<string>('');

  /** Bills filtered by search query */
  readonly filteredBills = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const bills = this.milkBillService.allBills();
    if (!query) return bills;
    return bills.filter(
      (b) =>
        b.billDate.toLowerCase().includes(query) ||
        (b.vendorName ?? '').toLowerCase().includes(query)
    );
  });

  /** Grouped deliveries: Date -> Recipient -> Bills */
  readonly groupedDeliveries = computed<DateGroup[]>(() => {
    const bills = this.filteredBills();
    const dateMap = new Map<string, Map<string, MilkBill[]>>();

    for (const b of bills) {
      const dKey = b.billDate;
      const rKey = b.vendorName?.trim() || 'General / Unnamed';

      if (!dateMap.has(dKey)) {
        dateMap.set(dKey, new Map<string, MilkBill[]>());
      }
      const rMap = dateMap.get(dKey)!;
      if (!rMap.has(rKey)) {
        rMap.set(rKey, []);
      }
      rMap.get(rKey)!.push(b);
    }

    const result: DateGroup[] = [];

    // Dates in descending order
    const sortedDates = [...dateMap.keys()].sort().reverse();

    for (const date of sortedDates) {
      const rMap = dateMap.get(date)!;
      const recipientGroups: RecipientGroup[] = [];
      let dateLiters = 0;
      let dateAmount = 0;

      // Recipients sorted alphabetically
      const sortedRecipients = [...rMap.keys()].sort();

      for (const rName of sortedRecipients) {
        const itemBills = rMap.get(rName)!;

        // Sort bills: Morning first, then Evening
        itemBills.sort((a, b) => (a.shift === 'Morning' ? -1 : 1));

        const rLiters = itemBills.reduce((sum, b) => sum + b.quantityLiters, 0);
        const rAmount = itemBills.reduce((sum, b) => sum + b.totalAmount, 0);

        dateLiters += rLiters;
        dateAmount += rAmount;

        recipientGroups.push({
          groupKey: `${date}__${rName}`,
          recipientName: rName,
          totalLiters: Math.round(rLiters * 100) / 100,
          totalAmount: Math.round(rAmount * 100) / 100,
          bills: itemBills,
        });
      }

      result.push({
        date,
        formattedDate: formatDateLabel(date),
        totalLiters: Math.round(dateLiters * 100) / 100,
        totalAmount: Math.round(dateAmount * 100) / 100,
        recipientGroups,
      });
    }

    return result;
  });

  toggleGroup(groupKey: string): void {
    this.expandedGroupKey.update((current) => (current === groupKey ? null : groupKey));
  }

  edit(id: string, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/edit', id]);
  }

  async delete(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.milkBillService.deleteBill(id);
  }
}
