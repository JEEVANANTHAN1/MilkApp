import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MilkBillService } from '../../../features/milk-bill/milk-bill.service';

@Component({
  selector: 'app-initial-loading-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './initial-loading-screen.component.html',
  styleUrl: './initial-loading-screen.component.scss',
})
export class InitialLoadingScreenComponent {
  protected readonly milkBillService = inject(MilkBillService);

  /** Estimated progress percentage (0 - 100%) based on 50-second typical cold start */
  protected readonly progressPercent = computed(() => {
    const sec = this.milkBillService.elapsedSeconds();
    if (this.milkBillService.loadingStage() === 'ready') return 100;
    // Target time is ~50 seconds; cap progress at 95% until actually ready
    const percent = Math.min(95, Math.round((sec / 50) * 100));
    return percent;
  });

  retry(): void {
    this.milkBillService.retryConnection();
  }

  continueOffline(): void {
    this.milkBillService.useOfflineMode();
  }
}
