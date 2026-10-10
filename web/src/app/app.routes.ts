import { Routes } from '@angular/router';
import { roleGuard } from './core/auth';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.Login), title: 'Digital Buku Pink' },
  {
    path: 'queue', canActivate: [roleGuard], data: { roles: ['nurse', 'clinic_admin'] },
    loadComponent: () => import('./features/queue/queue').then(m => m.Queue), title: 'Queue | Digital Buku Pink',
  },
  {
    // Nurse only: clinic_admin deep links redirect to the queue.
    path: 'patients', canActivate: [roleGuard], data: { roles: ['nurse'] },
    loadComponent: () => import('./features/patients/patients').then(m => m.Patients), title: 'Patients | Digital Buku Pink',
  },
  {
    // Read-only for clinic_admin (list only); issuing is nurse only.
    path: 'codes', canActivate: [roleGuard], data: { roles: ['nurse', 'clinic_admin'] },
    loadComponent: () => import('./features/codes/codes').then(m => m.Codes), title: 'Codes | Digital Buku Pink',
  },
  { path: '', pathMatch: 'full', redirectTo: 'queue' },
  { path: '**', redirectTo: 'queue' },
];
