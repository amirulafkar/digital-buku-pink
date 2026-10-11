import { Routes } from '@angular/router';
import { authGuard } from './core/auth';

export const routes: Routes = [
  { path: 'activate', loadComponent: () => import('./features/activate/activate').then(m => m.Activate), data: { titleKey: 'title.activate' } },
  { path: 'login', loadComponent: () => import('./features/login/login').then(m => m.Login), data: { titleKey: 'title.login' } },
  { path: 'home', canActivate: [authGuard], loadComponent: () => import('./features/home/home').then(m => m.Home), data: { titleKey: 'title.home' } },
  { path: 'scan', canActivate: [authGuard], loadComponent: () => import('./features/scan/scan').then(m => m.Scan), data: { titleKey: 'title.scan' } },
  { path: 'confirmation', canActivate: [authGuard], loadComponent: () => import('./features/confirmation/confirmation').then(m => m.Confirmation), data: { titleKey: 'title.confirmation' } },
  { path: 'status', canActivate: [authGuard], loadComponent: () => import('./features/status/status').then(m => m.Status), data: { titleKey: 'title.status' } },
  // FR-10 notifications (Inbox) were cut for this slice; Settings takes the fourth tab.
  { path: 'settings', canActivate: [authGuard], loadComponent: () => import('./features/settings/settings').then(m => m.Settings), data: { titleKey: 'title.settings' } },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
