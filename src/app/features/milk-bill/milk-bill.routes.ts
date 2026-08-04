import { Routes } from '@angular/router';

export const MILK_BILL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'bills',
    loadComponent: () =>
      import('./milk-bill-list/milk-bill-list.component').then((m) => m.MilkBillListComponent),
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./milk-bill-form/milk-bill-form.component').then((m) => m.MilkBillFormComponent),
  },
];
