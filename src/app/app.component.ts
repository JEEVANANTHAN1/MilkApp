import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { InitialLoadingScreenComponent } from './core/components/initial-loading-screen/initial-loading-screen.component';
import { MilkBillService } from './features/milk-bill/milk-bill.service';
import { AuthService } from './features/auth/auth.service';
import { LoadingService } from './core/services/loading.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, InitialLoadingScreenComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Milk Flow';
  protected readonly milkBillService = inject(MilkBillService);
  protected readonly auth = inject(AuthService);
  protected readonly loadingService = inject(LoadingService);
  private readonly router = inject(Router);

  showLogoutConfirm = signal<boolean>(false);

  /** True when the current route is the login page — hides the shell chrome */
  protected readonly isLoginPage = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map((e: NavigationEnd) => e.urlAfterRedirects.startsWith('/login')),
      startWith(this.router.url.startsWith('/login')),
    ),
    { initialValue: false }
  );

  protected openLogoutConfirm(): void {
    this.showLogoutConfirm.set(true);
  }

  protected cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }

  protected confirmLogout(): void {
    this.showLogoutConfirm.set(false);
    this.auth.logout();
  }
}

