import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MilkBillService } from '../milk-bill.service';

const ALL_TIME = 'all';

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Shifts a 'yyyy-MM' key by a number of whole months (negative to go back) */
function shiftMonthKey(key: string, offset: number): string {
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key: string): string {
  if (key === ALL_TIME) return 'All time';
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly milkBillService = inject(MilkBillService);
  protected readonly formatMonthLabel = formatMonthLabel;
  protected readonly ALL_TIME = ALL_TIME;

  protected readonly selectedMonth = signal<string>(currentMonthKey());

  /** Distinct months that have bills (descending), always including the current month even if it has none yet */
  protected readonly monthOptions = computed(() => {
    const keys = new Set(this.milkBillService.allBills().map((b) => b.billDate.slice(0, 7)));
    keys.add(currentMonthKey());
    return [...keys].sort().reverse();
  });

  protected readonly filteredBills = computed(() => {
    const month = this.selectedMonth();
    const bills = this.milkBillService.allBills();
    return month === ALL_TIME ? bills : bills.filter((b) => b.billDate.startsWith(month));
  });

  protected readonly filteredTotalSpent = computed(() =>
    this.filteredBills().reduce((sum, b) => sum + b.totalAmount, 0)
  );

  protected readonly filteredTotalLiters = computed(() =>
    this.filteredBills().reduce((sum, b) => sum + b.quantityLiters, 0)
  );

  /** Weighted average rate across the filtered bills (total spent / total liters) */
  protected readonly filteredAverageRate = computed(() => {
    const liters = this.filteredTotalLiters();
    return liters > 0 ? this.filteredTotalSpent() / liters : 0;
  });

  protected readonly recentBills = computed(() => this.filteredBills().slice(0, 5));

  /** % change vs. the month right before the selected one; null for "All time" or when there's nothing to compare against */
  protected readonly monthDeltaPercent = computed(() => {
    const month = this.selectedMonth();
    if (month === ALL_TIME) return null;

    const previousKey = shiftMonthKey(month, -1);
    const previousTotal = this.milkBillService
      .allBills()
      .filter((b) => b.billDate.startsWith(previousKey))
      .reduce((sum, b) => sum + b.totalAmount, 0);

    if (previousTotal === 0) return null;
    return ((this.filteredTotalSpent() - previousTotal) / previousTotal) * 100;
  });

  setMonth(value: string): void {
    this.selectedMonth.set(value);
  }
}
