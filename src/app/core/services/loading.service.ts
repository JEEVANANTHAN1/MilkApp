import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly activeRequests = signal(0);

  /** True whenever one or more HTTP API requests are in-flight */
  readonly isLoadingApi = computed(() => this.activeRequests() > 0);

  show(): void {
    this.activeRequests.update(count => count + 1);
  }

  hide(): void {
    this.activeRequests.update(count => Math.max(0, count - 1));
  }
}
