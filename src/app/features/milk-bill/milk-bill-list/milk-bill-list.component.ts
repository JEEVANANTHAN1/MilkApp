import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MilkBillService } from '../milk-bill.service';

@Component({
  selector: 'app-milk-bill-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './milk-bill-list.component.html',
  styleUrl: './milk-bill-list.component.scss',
})
export class MilkBillListComponent {
  readonly milkBillService = inject(MilkBillService);

  expandedId = signal<string | null>(null);

  toggleExpand(id: string): void {
    this.expandedId.update((current) => (current === id ? null : id));
  }

  async delete(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.milkBillService.deleteBill(id);
  }
}
