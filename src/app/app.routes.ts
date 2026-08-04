import { Routes } from '@angular/router';

export const routes: Routes = [
    {
  path: '',
  loadChildren: () => import('./features/milk-bill/milk-bill.routes').then(m => m.MILK_BILL_ROUTES),
},
];
