import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MilkBillService } from '../milk-bill.service';

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

  expandedId = signal<string | null>(null);
  searchQuery = signal<string>('');

  /** Bills filtered by search query across date and vendor name */
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

  toggleExpand(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
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
