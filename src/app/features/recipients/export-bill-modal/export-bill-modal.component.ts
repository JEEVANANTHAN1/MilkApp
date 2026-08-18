import { Component, Input, Output, EventEmitter, signal, computed, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MilkRecipient } from '../models/milk-recipient.model';
import { MilkBillService } from '../../milk-bill/milk-bill.service';
import { MilkBill } from '../../milk-bill/models/milk-bill.model';

export type DatePreset = 'this_month' | 'last_month' | 'last_30_days' | 'all_time' | 'custom';

@Component({
  selector: 'app-export-bill-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './export-bill-modal.component.html',
  styleUrl: './export-bill-modal.component.scss',
})
export class ExportBillModalComponent implements OnChanges {
  private readonly milkBillService = inject(MilkBillService);

  @Input() recipient: MilkRecipient | null = null;
  @Input() isOpen = false;
  @Input() initialMonth?: string; // Optional 'YYYY-MM' hint

  @Output() closeModal = new EventEmitter<void>();

  selectedPreset = signal<DatePreset>('this_month');
  startDate = signal<string>(this.getFirstDayOfCurrentMonth());
  endDate = signal<string>(this.getTodayIso());
  copiedToast = signal<boolean>(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      if (this.initialMonth && /^\d{4}-\d{2}$/.test(this.initialMonth)) {
        const [year, month] = this.initialMonth.split('-').map(Number);
        const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDayNum = new Date(year, month, 0).getDate();
        const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
        this.selectedPreset.set('custom');
        this.startDate.set(firstDay);
        this.endDate.set(lastDay);
      } else {
        this.setPreset('this_month');
      }
    }
  }

  /** All recipient bills filtered by selected recipient and date range */
  filteredBills = computed<MilkBill[]>(() => {
    const rId = this.recipient?.id;
    if (!rId) return [];

    let list = this.milkBillService.allBills().filter((b) => b.recipientId === rId);

    const start = this.startDate();
    const end = this.endDate();

    if (start) {
      list = list.filter((b) => b.billDate >= start);
    }
    if (end) {
      list = list.filter((b) => b.billDate <= end);
    }

    return list.sort((a, b) => a.billDate.localeCompare(b.billDate)); // Chronological for statement
  });

  totalLiters = computed(() =>
    this.filteredBills().reduce((sum, b) => sum + b.quantityLiters, 0)
  );

  totalAmount = computed(() =>
    this.filteredBills().reduce((sum, b) => sum + b.totalAmount, 0)
  );

  avgRate = computed(() => {
    const liters = this.totalLiters();
    if (liters === 0) return 0;
    return this.totalAmount() / liters;
  });

  deliveryDaysCount = computed(() => {
    const dates = new Set(this.filteredBills().map((b) => b.billDate));
    return dates.size;
  });

  morningCount = computed(() =>
    this.filteredBills().filter((b) => b.shift === 'Morning').length
  );

  eveningCount = computed(() =>
    this.filteredBills().filter((b) => b.shift === 'Evening').length
  );

  setPreset(preset: DatePreset): void {
    this.selectedPreset.set(preset);
    const today = new Date();

    if (preset === 'this_month') {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      this.startDate.set(`${year}-${month}-01`);
      this.endDate.set(this.getTodayIso());
    } else if (preset === 'last_month') {
      const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const year = prevMonthDate.getFullYear();
      const month = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(year, prevMonthDate.getMonth() + 1, 0).getDate();

      this.startDate.set(`${year}-${month}-01`);
      this.endDate.set(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
    } else if (preset === 'last_30_days') {
      const past30 = new Date();
      past30.setDate(today.getDate() - 30);
      this.startDate.set(past30.toISOString().slice(0, 10));
      this.endDate.set(this.getTodayIso());
    } else if (preset === 'all_time') {
      this.startDate.set('');
      this.endDate.set('');
    }
  }

  onCustomDateChange(): void {
    this.selectedPreset.set('custom');
  }

  close(): void {
    this.closeModal.emit();
  }

  /** Trigger Browser Print for PDF saving */
  printStatement(): void {
    window.print();
  }

  /** Export to downloadable CSV file */
  exportCsv(): void {
    const bills = this.filteredBills();
    const recipientName = this.recipient?.name || 'Recipient';
    const cleanName = recipientName.replace(/[^a-zA-Z0-9]/g, '_');

    let csvContent = 'Date,Shift,Quantity (Liters),Rate (INR/L),FAT (%),SNF (%),Total Amount (INR),Notes\n';

    bills.forEach((b) => {
      const row = [
        `"${b.billDate}"`,
        `"${b.shift}"`,
        b.quantityLiters,
        b.ratePerLiter,
        b.fatPercent ?? '',
        b.snfPercent ?? '',
        b.totalAmount,
        `"${(b.notes || '').replace(/"/g, '""')}"`,
      ].join(',');
      csvContent += row + '\n';
    });

    // Summary row
    csvContent += `\n"TOTAL",,${this.totalLiters().toFixed(2)},,,,"${this.totalAmount().toFixed(2)}",\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const rangeStr = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    link.setAttribute('download', `${cleanName}_Milk_Bill_${rangeStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /** Copy text summary for WhatsApp / SMS */
  async copyTextSummary(): Promise<void> {
    const rName = this.recipient?.name || 'Recipient';
    const start = this.startDate() || 'Beginning';
    const end = this.endDate() || 'Today';
    const bills = this.filteredBills();

    let text = `🥛 *MILK BILL STATEMENT*\n`;
    text += `👤 *Recipient:* ${rName}\n`;
    text += `📅 *Period:* ${start} to ${end}\n`;
    text += `-----------------------------------\n`;

    bills.forEach((b) => {
      const shiftIcon = b.shift === 'Morning' ? '🌅' : '🌆';
      text += `${b.billDate} ${shiftIcon}: ${b.quantityLiters}L @ ₹${b.ratePerLiter} = ₹${b.totalAmount}\n`;
    });

    text += `-----------------------------------\n`;
    text += `📊 *Total Quantity:* ${this.totalLiters().toFixed(1)} Liters\n`;
    text += `💵 *Total Amount:* ₹${this.totalAmount().toFixed(2)}\n`;
    text += `🗓️ *Delivery Days:* ${this.deliveryDaysCount()} days\n`;
    text += `⚡ Generated via MilkApp`;

    try {
      await navigator.clipboard.writeText(text);
      this.copiedToast.set(true);
      setTimeout(() => this.copiedToast.set(false), 2500);
    } catch {
      alert('Failed to copy to clipboard. Please copy manually.');
    }
  }

  private getTodayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getFirstDayOfCurrentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
}
