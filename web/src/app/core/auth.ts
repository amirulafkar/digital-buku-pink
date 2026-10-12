import { HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { catchError, from, switchMap, throwError } from 'rxjs';

export type Role = 'nurse' | 'clinic_admin' | 'patient';

interface TokenResponse { accessToken: string; refreshToken: string; expiresIn: number; role: Role }

const RT_KEY = 'dbp.rt'; // refresh token only, sessionStorage (cleared when the tab closes). The access token is memory only.

@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);

  private access = signal<string | null>(null); // memory only, never localStorage
  readonly role = signal<Role | null>(null);
  readonly expired = signal(false);
  readonly username = signal<string | null>(null); // display only, memory only
  readonly signedIn = computed(() => this.role() !== null);
  readonly isNurse = computed(() => this.role() === 'nurse');
  readonly isAdmin = computed(() => this.role() === 'clinic_admin');

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
    this.role.set(r.role);
    sessionStorage.setItem(RT_KEY, r.refreshToken);
    this.expired.set(false);
  }

  async login(username: string, password: string): Promise<boolean> {
    try {
      const r = await firstValueFrom(this.http.post<TokenResponse>('/api/v1/auth/login',
        { identifier: username, password, deviceName: 'staff-web' }));
      if (r.role === 'patient') return false; // staff dashboard only
      this.apply(r);
      this.username.set(username);
      return true;
    } catch { return false; }
  }

  /** Single-flight: concurrent 401s share one refresh call. */
  refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    const rt = sessionStorage.getItem(RT_KEY);
    if (!rt) return Promise.resolve(false);
    this.refreshing = firstValueFrom(this.http.post<TokenResponse>('/api/v1/auth/refresh', { refreshToken: rt }))
      .then(r => { this.apply(r); return true; })
      .catch(() => false)
      .finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  /** Called once at startup so a page reload keeps the session. */
  async restore(): Promise<void> { if (sessionStorage.getItem(RT_KEY)) await this.refresh(); }

  async logout(expired = false): Promise<void> {
    this.beforeLogout.forEach(f => f()); // stop live updates before the tokens go
    const rt = sessionStorage.getItem(RT_KEY);
    sessionStorage.removeItem(RT_KEY);
    this.access.set(null);
    this.role.set(null);
    this.username.set(null);
    this.expired.set(expired);
    if (rt) { try { await firstValueFrom(this.http.post('/api/v1/auth/logout', { refreshToken: rt })); } catch { /* best effort */ } }
    await this.router.navigateByUrl('/login');
  }
}

const isAuthCall = (req: HttpRequest<unknown>) => req.url.includes('/api/v1/auth/');

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

/** Route data: { roles: ['nurse'] } or { roles: ['nurse','clinic_admin'] }. Unknown role goes to the queue; signed out goes to login. */
export const roleGuard: CanActivateFn = route => {
  const auth = inject(Auth);
  const router = inject(Router);
  const role = auth.role();
  if (!role) return router.parseUrl('/login');
  const allowed = (route.data['roles'] as Role[] | undefined) ?? [];
  return allowed.includes(role) ? true : router.parseUrl('/queue');
};
