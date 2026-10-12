import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, firstValueFrom, from, switchMap, throwError } from 'rxjs';

interface TokenResponse { accessToken: string; refreshToken: string; expiresIn: number; role: string }

/**
 * Token storage adapter. The PWA keeps both tokens in memory only (a reload means log in again).
 * A native build swaps this for platform secure storage (Keychain / Keystore) after a plugin licence check.
 * Nothing is ever written to localStorage, sessionStorage or Preferences.
 */
export interface TokenStore { get(): string | null; set(v: string | null): void }
class MemoryTokenStore implements TokenStore {
  private v: string | null = null;
  get() { return this.v; }
  set(v: string | null) { this.v = v; }
}

const isAuthCall = (req: HttpRequest<unknown>) => req.url.includes('/api/v1/auth/');

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);
  private store: TokenStore = new MemoryTokenStore();

  private access = signal<string | null>(null);
  readonly signedIn = signal(false);
  readonly notice = signal<'ready' | 'expired' | null>(null); // message shown on the login screen
  readonly isMother = computed(() => this.signedIn());
  private refreshing: Promise<boolean> | null = null;

  get token(): string | null { return this.access(); }
  /** Hooks that run before tokens are cleared on logout (the live connection stops first). */
  readonly beforeLogout: (() => void)[] = [];

  /** Refreshes the access token when it is within a minute of expiry (used before a live reconnect). */
  async ensureFresh(): Promise<void> {
    const t = this.access();
    if (!t) return;
    try {
      const exp = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
      if (exp - Date.now() < 60_000) await this.refresh();
    } catch { /* an unreadable token is replaced on the next 401 */ }
  }


  private apply(r: TokenResponse): void {
    this.access.set(r.accessToken);
    this.store.set(r.refreshToken); // rotated on every refresh
    this.signedIn.set(true);
  }

  /** Returns 'ok', 'denied' (wrong details or locked, same message) or 'limited' (429) or 'error'. */
  async login(phone: string, password: string): Promise<'ok' | 'denied' | 'limited' | 'error'> {
    try {
      const r = await firstValueFrom(this.http.post<TokenResponse>('/api/v1/auth/login', { identifier: phone, password, deviceName: 'Web dev' }));
      if (r.role !== 'patient') return 'denied';
      this.apply(r);
      this.notice.set(null);
      return 'ok';
    } catch (e) {
      const s = e instanceof HttpErrorResponse ? e.status : 0;
      return s === 401 ? 'denied' : s === 429 ? 'limited' : 'error';
    }
  }

  async activate(code: string, phone: string, password: string): Promise<'ok' | 'invalid' | 'limited' | 'error'> {
    try {
      await firstValueFrom(this.http.post('/api/v1/auth/activate', { code, phone, password }));
      this.notice.set('ready');
      return 'ok';
    } catch (e) {
      const s = e instanceof HttpErrorResponse ? e.status : 0;
      return s === 400 ? 'invalid' : s === 429 ? 'limited' : 'error';
    }
  }

  /** Single flight: concurrent 401s share one refresh. The rotated refresh token replaces the old one. */
  refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    const rt = this.store.get();
    if (!rt) return Promise.resolve(false);
    this.refreshing = firstValueFrom(this.http.post<TokenResponse>('/api/v1/auth/refresh', { refreshToken: rt }))
      .then(r => { this.apply(r); return true; })
      .catch(() => false)
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async logout(expired = false): Promise<void> {
    this.beforeLogout.forEach(f => f()); // stop live updates before the tokens go
    const rt = this.store.get();
    this.store.set(null);
    this.access.set(null);
    this.signedIn.set(false);
    this.notice.set(expired ? 'expired' : null);
    if (rt) { try { await firstValueFrom(this.http.post('/api/v1/auth/logout', { refreshToken: rt })); } catch { /* best effort */ } }
    await this.router.navigateByUrl('/login');
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const withToken = (r: HttpRequest<unknown>) =>
    auth.token && !isAuthCall(r) ? r.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } }) : r;
  return next(withToken(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall(req)) return throwError(() => err);
      return from(auth.refresh()).pipe(
        switchMap(ok => {
          if (!ok) { void auth.logout(true); return throwError(() => err); }
          return next(withToken(req));
        }),
      );
    }),
  );
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.signedIn() ? true : inject(Router).parseUrl('/login');
};
