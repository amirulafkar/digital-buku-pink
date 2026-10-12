import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { Events } from './core/events';
import { I18n } from './core/i18n';
import { Live } from './core/live';
import { Connectivity } from './core/poll';
import { ThemeService } from './core/theme';
import { MohNotice } from './shared/notice';
import { OfflineBanner } from './shared/states';
import { WalkInDialog } from './shared/walkin-dialog';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, MohNotice, OfflineBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnDestroy {
  i = inject(I18n);
  auth = inject(Auth);
  theme = inject(ThemeService);
  private live = inject(Live); // created here so the connection follows sign-in and sign-out
  conn = inject(Connectivity);
  private dialog = inject(MatDialog);
  private events = inject(Events);
  private router = inject(Router);

  isDark = computed(() => this.theme.theme() === 'dark');
  roleLabel = computed(() => {
    const r = this.auth.role();
    return r === 'nurse' ? this.i.t('role.nurse') : r === 'clinic_admin' ? this.i.t('role.clinic_admin') : '';
  });
  initials = computed(() => (this.auth.username() ?? this.auth.role() ?? '?').slice(0, 2).toUpperCase());

  // The MOH notice lives in the sidebar on wide screens and in the footer otherwise (never hidden).
  private mq = window.matchMedia('(min-width: 1100px)');
  wide = signal(this.mq.matches);
  private onMq = (e: MediaQueryListEvent) => this.wide.set(e.matches);

  q = '';
  toast = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() { this.mq.addEventListener('change', this.onMq); }
  ngOnDestroy(): void { this.mq.removeEventListener('change', this.onMq); }

  logout(): void { void this.auth.logout(); }

  search(): void {
    const q = this.q.trim();
    if (q.length < 2) return;
    this.events.searchHandoff.set(q); // in memory only: search text never goes into the URL
    this.q = '';
    void this.router.navigate(['/patients']);
  }

  walkIn(): void {
    this.dialog.open<WalkInDialog, unknown, string>(WalkInDialog, { autoFocus: 'first-tabbable' }).afterClosed().subscribe(no => {
      if (!no) return;
      this.events.bump();
      this.toast.set(this.i.t('walkin.done', { no }));
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toast.set(null), 6000);
    });
  }
}
