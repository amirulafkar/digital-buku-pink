import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter } from '@angular/router';
import { LocalizedTitle } from './core/title';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideIonicAngular({ mode: 'md', animated: false }),
    provideRouter(routes),
    { provide: TitleStrategy, useExisting: LocalizedTitle },
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
