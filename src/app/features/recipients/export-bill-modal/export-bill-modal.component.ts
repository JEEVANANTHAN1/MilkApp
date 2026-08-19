import { Component, Input, Output, EventEmitter, signal, computed, inject, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import html2canvas from 'html2canvas';
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

  @ViewChild('billReceiptRef') billReceiptRef?: ElementRef<HTMLDivElement>;

  @Input() recipient: MilkRecipient | null = null;
  @Input() isOpen = false;
  @Input() initialMonth?: string; // Optional 'YYYY-MM' hint

  @Output() closeModal = new EventEmitter<void>();

  selectedPreset = signal<DatePreset>('this_month');
  startDate = signal<string>(this.getFirstDayOfCurrentMonth());
  endDate = signal<string>(this.getTodayIso());
  
  // WhatsApp & Image Export State
  whatsappPhone = signal<string>('');
  countryCode = signal<string>('+91');
  phoneError = signal<string | null>(null);
  isGeneratingImage = signal<boolean>(false);
  copiedToast = signal<boolean>(false);
  actionToast = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.phoneError.set(null);
      this.actionToast.set(null);
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

  private getCleanFileName(): string {
    const recipientName = this.recipient?.name || 'Recipient';
    const cleanName = recipientName.replace(/[^a-zA-Z0-9]/g, '_');
    const rangeStr = this.startDate() && this.endDate() ? `${this.startDate()}_to_${this.endDate()}` : 'all_time';
    return `${cleanName}_Milk_Bill_${rangeStr}`;
  }

  /** Capture the HTML table bill receipt container as a high-resolution Canvas */
  private async captureBillCanvas(): Promise<HTMLCanvasElement | null> {
    const el = this.billReceiptRef?.nativeElement || document.getElementById('billImageReceipt');
    if (!el) {
      alert('Unable to find bill receipt element to generate image.');
      return null;
    }

    try {
      this.isGeneratingImage.set(true);
      const canvas = await html2canvas(el, {
        scale: 2, // 2x resolution for crisp text & borders
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      return canvas;
    } catch (err) {
      console.error('Error generating bill image with html2canvas:', err);
      alert('Failed to generate bill image. Please try again.');
      return null;
    } finally {
      this.isGeneratingImage.set(false);
    }
  }

  /** Download the HTML Bill Table as a PNG image */
  async downloadBillImage(): Promise<void> {
    if (this.filteredBills().length === 0) {
      alert('No bill records to export as image.');
      return;
    }

    const canvas = await this.captureBillCanvas();
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${this.getCleanFileName()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('✅ Bill image downloaded successfully!');
  }

  /** Copy Bill Image to clipboard (if supported) */
  async copyBillImage(): Promise<void> {
    if (this.filteredBills().length === 0) {
      alert('No bill records to export.');
      return;
    }

    const canvas = await this.captureBillCanvas();
    if (!canvas) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          this.showToast('📋 Bill image copied to clipboard!');
        } else {
          this.downloadBillImage();
        }
      } catch (err) {
        console.warn('Clipboard write failed, downloading image instead:', err);
        this.downloadBillImage();
      }
    }, 'image/png');
  }

  /** Validates WhatsApp phone number and formats with country code */
  private getFormattedWhatsAppNumber(): string | null {
    const raw = this.whatsappPhone().trim().replace(/[\s\-\(\)]/g, '');
    if (!raw) {
      this.phoneError.set('Please enter a WhatsApp phone number.');
      return null;
    }

    // If starts with +, remove +
    let cleaned = raw.startsWith('+') ? raw.slice(1) : raw;

    // If 10 digits, prefix country code (e.g. 91)
    if (/^\d{10}$/.test(cleaned)) {
      const code = this.countryCode().replace('+', '');
      cleaned = `${code}${cleaned}`;
    }

    if (!/^\d{7,15}$/.test(cleaned)) {
      this.phoneError.set('Please enter a valid mobile phone number (10-12 digits).');
      return null;
    }

    this.phoneError.set(null);
    return cleaned;
  }

  /** Builds structured text statement for WhatsApp */
  buildWhatsAppMessageText(): string {
    const rName = this.recipient?.name || 'Recipient';
    const start = this.startDate() || 'Beginning';
    const end = this.endDate() || 'Today';
    const bills = this.filteredBills();

    let text = `🥛 *AGRO-FRESH DAIRY — MILK BILL*\n`;
    text += `👤 *Recipient:* ${rName}\n`;
    text += `📅 *Period:* ${start} to ${end}\n`;
    text += `─────────────────────\n`;
    text += `📊 *BILL SUMMARY*\n`;
    text += `🥛 *Total Volume:* ${this.totalLiters().toFixed(1)} L\n`;
    text += `💵 *Total Amount:* ₹${this.totalAmount().toFixed(2)}\n`;
    text += `📈 *Average Rate:* ₹${this.avgRate().toFixed(2)} / L\n`;
    text += `🗓️ *Delivery Days:* ${this.deliveryDaysCount()} days\n`;
    text += `─────────────────────\n`;
    text += `📝 *ITEMIZED DELIVERIES (${bills.length}):*\n`;

    bills.forEach((b) => {
      const shiftIcon = b.shift === 'Morning' ? '🌅' : '🌆';
      text += `• ${b.billDate} (${shiftIcon}): ${b.quantityLiters}L @ ₹${b.ratePerLiter} = ₹${b.totalAmount}\n`;
    });

    text += `─────────────────────\n`;
    text += `💳 *Total Amount Payable:* ₹${this.totalAmount().toFixed(2)}\n`;
    text += `🙏 Thank you for your business!`;

    return text;
  }

  /** Generate Image and Send via WhatsApp */
  async sendViaWhatsApp(): Promise<void> {
    if (this.filteredBills().length === 0) {
      alert('No bill records found to send.');
      return;
    }

    const phone = this.getFormattedWhatsAppNumber();
    if (!phone) {
      // Focus the phone input
      const inputEl = document.getElementById('whatsapp_phone_input');
      if (inputEl) inputEl.focus();
      return;
    }

    const messageText = this.buildWhatsAppMessageText();
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(messageText)}`;

    // 1. Generate & download the bill image automatically so user has the visual receipt ready to attach
    const canvas = await this.captureBillCanvas();
    if (canvas) {
      canvas.toBlob(async (blob) => {
        if (blob) {
          // Check if Web Share API with files is supported (mobile devices)
          const fileName = `${this.getCleanFileName()}.png`;
          const file = new File([blob], fileName, { type: 'image/png' });

          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                title: `Milk Bill - ${this.recipient?.name}`,
                text: messageText,
                files: [file],
              });
              this.showToast('✅ Bill shared to WhatsApp successfully!');
              return;
            } catch {
              // User cancelled share or fallback to direct URL
            }
          }

          // Fallback: download bill image for easy attaching in WhatsApp
          const link = document.createElement('a');
          link.download = fileName;
          link.href = URL.createObjectURL(blob);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // Open WhatsApp in a new tab
        window.open(whatsappUrl, '_blank');
        this.showToast(`✅ Bill image saved & WhatsApp opened for +${phone}!`);
      }, 'image/png');
    } else {
      // If canvas failed, still open WhatsApp text
      window.open(whatsappUrl, '_blank');
      this.showToast(`✅ WhatsApp opened for +${phone}!`);
    }
  }

  /** Trigger Browser Print for PDF saving */
  printStatement(): void {
    window.print();
  }

  /** Export to downloadable CSV file */
  exportCsv(): void {
    const bills = this.filteredBills();
    const cleanName = (this.recipient?.name || 'Recipient').replace(/[^a-zA-Z0-9]/g, '_');

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
    const text = this.buildWhatsAppMessageText();

    try {
      await navigator.clipboard.writeText(text);
      this.copiedToast.set(true);
      this.showToast('📋 Statement text copied to clipboard!');
      setTimeout(() => this.copiedToast.set(false), 2500);
    } catch {
      alert('Failed to copy to clipboard. Please copy manually.');
    }
  }

  private showToast(msg: string): void {
    this.actionToast.set(msg);
    setTimeout(() => {
      if (this.actionToast() === msg) {
        this.actionToast.set(null);
      }
    }, 4000);
  }

  private getTodayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getFirstDayOfCurrentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
}

