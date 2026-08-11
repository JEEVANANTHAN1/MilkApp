import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { InitialLoadingScreenComponent } from './core/components/initial-loading-screen/initial-loading-screen.component';
import { MilkBillService } from './features/milk-bill/milk-bill.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, InitialLoadingScreenComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'MilkApp';
  protected readonly milkBillService = inject(MilkBillService);
}
