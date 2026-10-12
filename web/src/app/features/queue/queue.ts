import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { Api, Nurse, PatchBody, QueueEntry, Room, Status } from '../../core/api';
import { Auth } from '../../core/auth';
import { I18n } from '../../core/i18n';
import { Events } from '../../core/events';
import { Live } from '../../core/live';
import { Connectivity, Poller } from '../../core/poll';
import { EmptyState, ErrorState, Skeleton } from '../../shared/states';
import { StatusChip } from '../../shared/status-chip';
import { AssignDialog, MissedDialog } from './dialogs';

@Component({
  selector: 'app-queue',
  imports: [MatButtonModule, RouterLink, StatusChip, Skeleton, EmptyState, ErrorState],
  templateUrl: './queue.html',
  styleUrl: './queue.scss',
})
export class Queue implements OnInit, OnDestroy {
  i = inject(I18n);
  auth = inject(Auth);
  conn = inject(Connectivity);
  private api = inject(Api);
  private dialog = inject(MatDialog);
  private events = inject(Events);
  live = inject(Live);

  entries = signal<QueueEntry[]>([]);
  loaded = signal(false);
  failed = signal(false);
  updated = signal<string | null>(null);
  message = signal<string | null>(null);
  busy = signal<string | null>(null);
  rooms = signal<Room[]>([]);
  nurses = signal<Nurse[]>([]);

  private roomName = computed(() => new Map(this.rooms().map(r => [r.id, r.name])));
  private nurseName = computed(() => new Map(this.nurses().map(n => [n.id, n.displayName])));
  canWrite = computed(() => this.auth.isNurse() && !this.conn.offline());
  isAdmin = computed(() => this.auth.isAdmin());

  // Polling pauses while the live connection is up and takes over when it is not.
  private poller = new Poller(() => this.load(), this.conn, 5000, 15000, () => this.live.state() === 'live');
  private started = false;

  // Filters: 'all', a status, or 'walkin'. Order is always the server's check-in order.
  filter = signal<'all' | Status | 'walkin'>('all');
  count = computed(() => {
    const e = this.entries();
    const by = (s: Status) => e.filter(x => x.status === s).length;
    return { all: e.length, waiting: by('waiting'), called: by('called'), in_room: by('in_room'), completed: by('completed'), missed: by('missed'), walkin: e.filter(x => !x.displayName).length };
  });
  visible = computed(() => {
    const f = this.filter(), e = this.entries();
    return f === 'all' ? e : f === 'walkin' ? e.filter(x => !x.displayName) : e.filter(x => x.status === f);
  });
  tabs: ('all' | Status)[] = ['all', 'waiting', 'called', 'in_room', 'completed', 'missed'];
  roomState = computed(() => {
    const busy = new Set(this.entries().filter(e => (e.status === 'called' || e.status === 'in_room') && e.roomId).map(e => e.roomId));
    return this.rooms().map(r => ({ name: this.i.roomName(r.name), inUse: busy.has(r.id) }));
  });

  constructor() {
    effect(() => {
      this.events.queueChanged();
      untracked(() => { if (this.started) void this.poller.refreshNow(); });
    });
    effect(() => {
      this.live.tick(); // a newer live event (or a reconnect) means: refetch once through the normal REST endpoint
      untracked(() => { if (this.started) void this.poller.refreshNow(); });
    });
  }

  setFilter(f: 'all' | Status | 'walkin'): void { this.filter.set(f); }
  tabLabel(t: 'all' | Status): string { return t === 'all' ? this.i.t('filter.all') : this.i.tk('status', t); }
  lbl(key: 'queue.call.label' | 'queue.inroom.label' | 'queue.done.label' | 'queue.missed.label' | 'queue.assign.label', e: QueueEntry): string {
    return this.i.t(key, { no: e.queueNo, name: this.name(e) });
  }

  ngOnInit(): void {
    void this.api.rooms().then(r => this.rooms.set(r)).catch(() => undefined);
    void this.api.nurses().then(n => this.nurses.set(n)).catch(() => undefined);
    this.started = true;
    this.poller.start();
  }

  ngOnDestroy(): void { this.poller.stop(); }

  /** Server order only: no client sorting, reordering or auto-selection. */
  private async load(): Promise<void> {
    try {
      const r = await this.api.queue();
      this.entries.set(r.entries);
      this.failed.set(false);
      this.loaded.set(true);
      this.updated.set(new Date().toISOString());
    } catch (e) {
      if (!this.loaded()) this.failed.set(true);
      throw e;
    }
  }

  retry(): void { this.failed.set(false); this.loaded.set(false); void this.poller.refreshNow(); }

  name(e: QueueEntry): string { return e.displayName ?? e.walkInName ?? ''; }
  room(e: QueueEntry): string | null { const n = e.roomId ? this.roomName().get(e.roomId) : null; return n ? n.replace(/^Bilik (\d+)$/, '$1') : null; } // the column label already says Room/Bilik, so show just the number
  rowLabel(e: QueueEntry): string { return this.i.t('queue.row.label', { no: e.queueNo, name: this.name(e), status: this.i.tk('status', e.status) }); }
  /** Counts show a dash until data has loaded, so loading or an error never reads as an empty clinic. */
  num(n: number): string { return this.loaded() && !this.failed() ? String(n) : '-'; }
  nurse(e: QueueEntry): string | null { return e.staffId ? this.nurseName().get(e.staffId) ?? null : null; }
  isClosed(e: QueueEntry): boolean { return e.status === 'completed' || e.status === 'missed'; }

  private async patch(e: QueueEntry, body: PatchBody): Promise<void> {
    this.busy.set(e.id);
    this.message.set(null);
    try {
      await this.api.patch(e.id, body);
      await this.poller.refreshNow();
    } catch (err) {
      this.message.set(this.i.t(err instanceof HttpErrorResponse && err.status === 409 ? 'queue.action.conflict' : 'queue.action.failed'));
    } finally { this.busy.set(null); }
  }

  move(e: QueueEntry, status: Status): Promise<void> { return this.patch(e, { status }); }

  askMissed(e: QueueEntry): void {
    this.dialog.open<MissedDialog, { entry: QueueEntry }, string>(MissedDialog, { data: { entry: e }, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(reason => { if (reason) void this.patch(e, { status: 'missed', reason }); });
  }

  askAssign(e: QueueEntry): void {
    this.dialog.open<AssignDialog, { entry: QueueEntry; rooms: Room[]; nurses: Nurse[] }, PatchBody>(AssignDialog,
      { data: { entry: e, rooms: this.rooms(), nurses: this.nurses() }, autoFocus: 'first-tabbable' })
      .afterClosed().subscribe(body => { if (body && Object.keys(body).length) void this.patch(e, body); });
  }
}
