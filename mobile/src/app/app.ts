import { Component, computed, inject } from '@angular/core';
import { IonApp } from '@ionic/angular/standalone';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';
import { I18n } from './core/i18n';
import { Live } from './core/live';
import { ThemeService } from './core/theme';
import { MohNotice, SafetyNotice } from './shared/notices';
import { OfflineBanner } from './shared/states';

@Component({
  selector: 'app-root',
  imports: [IonApp, RouterOutlet, RouterLink, RouterLinkActive, MohNotice, SafetyNotice, OfflineBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  i = inject(I18n);
  auth = inject(Auth);
  theme = inject(ThemeService);
  private live = inject(Live); // created here so the connection follows sign-in and sign-out
  isDark = computed(() => this.theme.theme() === 'dark');
}
