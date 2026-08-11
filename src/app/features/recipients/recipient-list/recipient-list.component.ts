import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MilkRecipientService } from '../milk-recipient.service';
import { MilkRecipient } from '../models/milk-recipient.model';

@Component({
  selector: 'app-recipient-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './recipient-list.component.html',
  styleUrl: './recipient-list.component.scss',
})
export class RecipientListComponent {
  protected readonly recipientService = inject(MilkRecipientService);

  searchQuery = signal<string>('');
  isFormOpen = signal<boolean>(false);
  editingId = signal<string | null>(null);
  nameInput = signal<string>('');
  statusInput = signal<'Active' | 'Inactive'>('Active');
  formError = signal<string | null>(null);
  isSaving = signal<boolean>(false);

  filteredRecipients = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const list = this.recipientService.allRecipients();
    if (!query) return list;
    return list.filter((r) => r.name.toLowerCase().includes(query));
  });

  openAddForm(): void {
    this.editingId.set(null);
    this.nameInput.set('');
    this.statusInput.set('Active');
    this.formError.set(null);
    this.isFormOpen.set(true);
  }

  startEdit(recipient: MilkRecipient, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.editingId.set(recipient.id);
    this.nameInput.set(recipient.name);
    this.statusInput.set(recipient.status);
    this.formError.set(null);
    this.isFormOpen.set(true);
  }

  cancelForm(): void {
    this.isFormOpen.set(false);
    this.editingId.set(null);
    this.nameInput.set('');
    this.formError.set(null);
  }

  async saveRecipient(): Promise<void> {
    const name = this.nameInput().trim();
    if (!name) {
      this.formError.set('Please enter a valid recipient name.');
      return;
    }

    this.isSaving.set(true);
    this.formError.set(null);

    try {
      if (this.editingId()) {
        await this.recipientService.updateRecipient(
          this.editingId()!,
          name,
          this.statusInput()
        );
      } else {
        await this.recipientService.addRecipient(name, this.statusInput());
      }
      this.cancelForm();
    } catch {
      this.formError.set('Failed to save recipient. Please try again.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async toggleStatus(id: string, event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    await this.recipientService.toggleStatus(id);
  }

  async deleteRecipient(id: string, name: string, event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    if (confirm(`Are you sure you want to delete recipient "${name}"?`)) {
      await this.recipientService.deleteRecipient(id);
    }
  }
}
