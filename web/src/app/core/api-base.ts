import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

/** Build-time API origin (empty in dev). It is never read from the URL, storage or any runtime setting. */
const API_BASE: string = environment.apiBase;

/** Prefixes a root-relative API or hub path with the build-time base. In dev the base is empty, so nothing changes. */
export const apiUrl = (path: string): string => API_BASE + path;

/** Builds the interceptor for a base. Rewrites /api/ and /hubs/ paths only; every other URL (absolute, assets) is left alone. */
export const makeApiBaseInterceptor = (base: string): HttpInterceptorFn => (req, next) =>
  base && (req.url.startsWith('/api/') || req.url.startsWith('/hubs/')) ? next(req.clone({ url: base + req.url })) : next(req);

/** The only place REST calls get the base. */
export const apiBaseInterceptor = makeApiBaseInterceptor(API_BASE);
