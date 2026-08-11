import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MilkRecipientService } from '../milk-recipient.service';
import { MilkBillService } from '../../milk-bill/milk-bill.service';
import { MilkBill } from '../../milk-bill/models/milk-bill.model';

export type DeliveryType = 'both' | 'morning' | 'evening' | 'none';

export interface CalendarDayCell {
  dateIso: string;
  dayNumber: number;
  isPadding: boolean;
  hasMorning: boolean;
  hasEvening: boolean;
  deliveryType: DeliveryType;
  dayLiters: number;
  dayAmount: number;
  bills: MilkBill[];
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

@Component({
  selector: 'app-recipient-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './recipient-detail.component.html',
  styleUrl: './recipient-detail.component.scss',
})
export class RecipientDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly recipientService = inject(MilkRecipientService);
  private readonly milkBillService = inject(MilkBillService);

  recipientId = signal<string>('');
  selectedMonth = signal<string>(currentMonthKey());
  selectedDateIso = signal<string | null>(todayIso());

  protected readonly formatMonthLabel = formatMonthLabel;

  /** Target recipient master record */
  recipient = computed(() => {
    const id = this.recipientId();
    return this.recipientService.allRecipients().find((r) => r.id === id);
  });

  /** All bills logged for this recipient */
  recipientBills = computed(() => {
    const rId = this.recipientId();
    const rName = this.recipient()?.name.toLowerCase();
    return this.milkBillService.allBills().filter((b) => {
      if (b.recipientId && b.recipientId === rId) return true;
      if (rName && b.vendorName?.trim().toLowerCase() === rName) return true;
      return false;
    });
  });

  /** Filtered bills for selected month */
  monthBills = computed(() => {
    const monthKey = this.selectedMonth();
    return this.recipientBills().filter((b) => b.billDate.startsWith(monthKey));
  });

  monthTotalLiters = computed(() =>
    this.monthBills().reduce((sum, b) => sum + b.quantityLiters, 0)
  );

  monthTotalAmount = computed(() =>
    this.monthBills().reduce((sum, b) => sum + b.totalAmount, 0)
  );

  monthDeliveryDaysCount = computed(() => {
    const dates = new Set(this.monthBills().map((b) => b.billDate));
    return dates.size;
  });

  /** Calendar grid cells for the selected month */
  calendarDays = computed<CalendarDayCell[]>(() => {
    const monthKey = this.selectedMonth();
    if (!monthKey || !monthKey.includes('-')) return [];

    const [year, month] = monthKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0 = Sun, 1 = Mon ...

    const allBills = this.recipientBills();
    const cells: CalendarDayCell[] = [];

    // Empty padding cells for start of month
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({
        dateIso: `padding-${i}`,
        dayNumber: 0,
        isPadding: true,
        hasMorning: false,
        hasEvening: false,
        deliveryType: 'none',
        dayLiters: 0,
        dayAmount: 0,
        bills: [],
      });
    }

    // Days 1 .. daysInMonth
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      const dateIso = `${year}-${monthStr}-${dayStr}`;

      const dayBills = allBills.filter((b) => b.billDate === dateIso);
      const hasMorning = dayBills.some((b) => b.shift === 'Morning');
      const hasEvening = dayBills.some((b) => b.shift === 'Evening');

      let deliveryType: DeliveryType = 'none';
      if (hasMorning && hasEvening) {
        deliveryType = 'both';
      } else if (hasMorning) {
        deliveryType = 'morning';
      } else if (hasEvening) {
        deliveryType = 'evening';
      }

      const dayLiters = dayBills.reduce((s, b) => s + b.quantityLiters, 0);
      const dayAmount = dayBills.reduce((s, b) => s + b.totalAmount, 0);

      cells.push({
        dateIso,
        dayNumber: day,
        isPadding: false,
        hasMorning,
        hasEvening,
        deliveryType,
        dayLiters,
        dayAmount,
        bills: dayBills,
      });
    }

    return cells;
  });

  /** Selected day cell detail object */
  selectedDayCell = computed(() => {
    const selDate = this.selectedDateIso();
    if (!selDate) return null;
    return this.calendarDays().find((c) => !c.isPadding && c.dateIso === selDate) || null;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.recipientId.set(id);
    }
  }

  prevMonth(): void {
    const [year, month] = this.selectedMonth().split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    const newKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.selectedMonth.set(newKey);
    this.selectedDateIso.set(null);
  }

  nextMonth(): void {
    const [year, month] = this.selectedMonth().split('-').map(Number);
    const d = new Date(year, month, 1);
    const newKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.selectedMonth.set(newKey);
    this.selectedDateIso.set(null);
  }

  selectDay(cell: CalendarDayCell): void {
    if (cell.isPadding) return;
    this.selectedDateIso.set(cell.dateIso);
  }

  async toggleRecipientStatus(): Promise<void> {
    const r = this.recipient();
    if (r) {
      await this.recipientService.toggleStatus(r.id);
    }
  }
}
