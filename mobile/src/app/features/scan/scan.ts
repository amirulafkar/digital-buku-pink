import { PageHeading } from '../../shared/page-heading';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, ViewContainerRef, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import jsQR from 'jsqr';
import { CheckIn, CheckInError, checkInError } from '../../core/api';
import { I18n, Key } from '../../core/i18n';
import { Connectivity } from '../../core/poll';

declare const ngDevMode: boolean | undefined; // false in production builds, so the developer paste path is dropped

@Component({
  imports: [PageHeading],
  selector: 'app-scan',
  template: `
    <section class="page" aria-labelledby="h">
      <h1 id="h" pageHeading>{{ i.t('scan.title') }}</h1>
      <p class="muted">{{ i.t('scan.intro') }}</p>

      @if (conn.offline()) { <p id="scan-off" class="msg" role="status"><i class="ph ph-wifi-slash" aria-hidden="true"></i>{{ i.t('scan.offline') }}</p> }
      @if (error(); as e) {
        <p class="msg bad" role="alert" data-testid="scan-error" [attr.data-code]="e"><i class="ph ph-warning-circle" aria-hidden="true"></i>{{ i.t(errKey()) }}</p>
      }
      @if (busy()) { <p class="msg" role="status"><i class="ph ph-circle-notch spin" aria-hidden="true"></i>{{ i.t('scan.busy') }}</p> }

      <div class="card cam" [hidden]="!camera()">
        <video #video playsinline muted aria-hidden="true"></video>
      </div>

      @if (!camera()) {
        @if (error() !== 'denied') {
          <button class="btn primary block" type="button" (click)="start()" [attr.aria-disabled]="conn.offline() || busy() ? 'true' : null" [attr.aria-describedby]="conn.offline() ? 'scan-off' : null" data-testid="open-camera"><i class="ph ph-camera" aria-hidden="true"></i>{{ i.t('scan.start') }}</button>
        }
      } @else {
        <button class="btn block" type="button" (click)="stop()"><i class="ph ph-x" aria-hidden="true"></i>{{ i.t('scan.stop') }}</button>
      }
      @if (error() === 'denied') {
        <button class="btn primary block" type="button" (click)="start()" [attr.aria-disabled]="conn.offline() ? 'true' : null" data-testid="camera-retry"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>{{ i.t('scan.retry') }}</button>
      }
      @if (retryToken()) {
        <button class="btn block" type="button" (click)="retry()" [disabled]="conn.offline() || busy()" data-testid="scan-retry"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i>{{ i.t('scan.retry') }}</button>
      }
      <button class="btn block" type="button" (click)="askStaff.set(!askStaff())" [attr.aria-expanded]="askStaff()" aria-controls="ask-text" data-testid="ask-staff"><i class="ph ph-hand-waving" aria-hidden="true"></i>{{ i.t('scan.ask') }}</button>
      @if (askStaff()) { <p id="ask-text" class="msg" role="status" data-testid="ask-text"><i class="ph ph-info" aria-hidden="true"></i>{{ i.t('scan.ask.text') }}</p> }
      <ng-container #devHost />
    </section>`,
  styles: [`
    .cam { padding: .5rem; } video { width: 100%; border-radius: var(--r-2); background: #000; max-height: 50vh; object-fit: cover; }
    .spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class Scan implements AfterViewInit, OnDestroy {
  i = inject(I18n);
  conn = inject(Connectivity);
  private router = inject(Router);
  private checkin = inject(CheckIn);

  @ViewChild('video') video?: ElementRef<HTMLVideoElement>;
  @ViewChild('devHost', { read: ViewContainerRef }) devHost?: ViewContainerRef;

  camera = signal(false);
  askStaff = signal(false);
  busy = signal(false);
  error = signal<CheckInError | 'denied' | 'unsupported' | null>(null);
  /** Kept in memory only after a lost response, so the retry reuses the same idempotency key. */
  retryToken = signal<string | null>(null);
  errKey = computed<Key>(() => {
    const e = this.error();
    return e === 'denied' ? 'scan.denied' : e === 'unsupported' ? 'scan.unsupported'
      : e === 'rate' ? 'scan.err.rate' : e === 'network' ? 'scan.err.network'
      : e === 'token_invalid' ? 'scan.err.token_invalid' : e === 'wrong_clinic' ? 'scan.err.wrong_clinic'
      : e === 'no_appointment_today' ? 'scan.err.no_appointment_today' : 'scan.err.other';
  });

  private stream: MediaStream | null = null;
  private raf = 0;

  async ngAfterViewInit(): Promise<void> {
    if (ngDevMode && this.devHost) {
      const m = await import('./dev-scan');
      const ref = this.devHost.createComponent(m.DevScan);
      ref.instance.submitToken.subscribe(t => void this.submit(t, true));
    }
  }

  ngOnDestroy(): void { this.stop(); }

  async start(): Promise<void> {
    if (this.conn.offline() || this.busy()) return; // aria-disabled: focusable, announces unavailable, does nothing
    this.error.set(null);
    if (!navigator.mediaDevices?.getUserMedia) { this.error.set('unsupported'); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch { this.error.set('denied'); return; }
    this.camera.set(true);
    const v = this.video!.nativeElement;
    v.srcObject = this.stream;
    await v.play().catch(() => undefined);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tick = () => {
      if (!this.camera()) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        if (code?.data) { this.stop(); void this.submit(code.data, true); return; }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.camera.set(false);
  }

  retry(): void { const t = this.retryToken(); if (t) void this.submit(t, false); }

  /** newAttempt: a fresh scan gets a fresh key; a retry after a lost response reuses the previous one. */
  async submit(token: string, newAttempt: boolean): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.checkin.submit(token, newAttempt);
      this.retryToken.set(null);
      await this.router.navigateByUrl('/confirmation');
    } catch (e) {
      const code = checkInError(e);
      this.error.set(code);
      this.retryToken.set(code === 'network' ? token : null);
    } finally { this.busy.set(false); }
  }
}
