import { Injectable, signal } from '@angular/core';

export type Lang = 'ms' | 'en';

/**
 * English source strings. Every key must exist in MS below (enforced by the type).
 * Placeholders use {name}; there is no string concatenation in components.
 * No waiting-time or estimate wording anywhere (product rule).
 */
export const EN = {
  'app.name': 'Digital Buku Pink',
  'app.demo': 'demo',
  'app.skip': 'Skip to main content',
  'notice.full': 'Prototype for demonstration. Not approved by the Ministry of Health (MOH). All data shown is fictional.',
  'nav.queue': 'Queue',
  'nav.patients': 'Patients',
  'nav.codes': 'Codes',
  'nav.label': 'Main navigation',
  'nav.language': 'Language',
  'nav.theme.dark': 'Dark theme',
  'nav.theme.light': 'Light theme',
  'nav.logout': 'Sign out',
  'role.nurse': 'Nurse',
  'role.clinic_admin': 'Clinic admin',
  'role.readonly': 'Read-only view',

  'login.title': 'Staff sign in',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.error': 'Sign in failed. Check your details or try again later.',
  'login.expired': 'Your session ended. Please sign in again.',
  'login.busy': 'Signing in',

  'status.waiting': 'Waiting',
  'status.called': 'Called',
  'status.in_room': 'In room',
  'status.completed': 'Done',
  'status.missed': 'Missed',
  'status.urgent': 'Urgent, set by staff',

  'queue.title': 'Today\'s queue',
  'queue.col.no': 'No.',
  'queue.col.name': 'Name',
  'queue.col.time': 'Checked in',
  'queue.col.status': 'Status',
  'queue.col.room': 'Room',
  'queue.col.nurse': 'Nurse',
  'queue.col.actions': 'Actions',
  'queue.walkin': 'Walk-in',
  'queue.empty': 'Nobody has checked in yet.',
  'queue.empty.action': 'Check in a patient',
  'queue.error': 'The queue could not be loaded.',
  'queue.retry': 'Retry',
  'queue.call': 'Call',
  'queue.inroom': 'In room',
  'queue.complete': 'Done',
  'queue.missed': 'Missed',
  'queue.assign': 'Assign',
  'queue.unassigned': 'Not assigned',
  'queue.order': 'Shown in order of check-in. Staff decide who is called.',
  'queue.updated': 'Updated {time}',
  'queue.readonly': 'You can view the queue but not change it.',
  'queue.row.label': 'Queue {no}, {name}, {status}',
  'queue.action.failed': 'The change was not saved. Try again.',
  'queue.action.conflict': 'That move is not allowed for this entry.',

  'assign.title': 'Assign entry {no}',
  'assign.room': 'Room',
  'assign.nurse': 'Nurse',
  'assign.none': 'No change',
  'assign.urgent': 'Mark as urgent (staff decision)',
  'assign.urgent.note': 'Only staff set this. The system never sets urgency.',
  'assign.urgent.reason': 'Reason for urgent',
  'assign.urgent.required': 'Choose a reason to mark urgent.',
  'assign.note': 'Saving does not change the status. Use the Call button to call.',
  'assign.save': 'Save',
  'assign.cancel': 'Cancel',
  'reason.staff_judgement': 'Staff judgement',
  'reason.accessibility_need': 'Accessibility need',
  'reason.family_request': 'Family request',
  'reason.other': 'Other',
  'reason.no_answer': 'No answer when called',
  'reason.left_clinic': 'Left the clinic',

  'missed.title': 'Mark entry {no} as missed',
  'missed.reason': 'Reason',
  'missed.required': 'Choose a reason.',
  'missed.confirm': 'Mark as missed',

  'patients.title': 'Patients',
  'patients.search': 'Search name or phone digits',
  'patients.min': 'Type at least 2 characters to search.',
  'patients.empty': 'No patients match your search.',
  'patients.appt': 'Appointment {time}, {type}',
  'patients.noappt': 'No appointment today',
  'patients.checkin': 'Check in',
  'patients.issue': 'Issue code',
  'patients.error': 'The search failed.',
  'patients.checkedin': 'Checked in. Queue number {no}.',
  'patients.walkin.title': 'Walk-in without a record',
  'patients.walkin.name': 'Walk-in name',
  'patients.walkin.hint': 'Name only. No phone number is kept.',
  'patients.walkin.submit': 'Check in walk-in',
  'visit.routine': 'Routine',
  'visit.booking': 'Booking',
  'visit.virtual': 'Virtual',

  'codes.title': 'Activation codes',
  'codes.issue.title': 'Issue a code',
  'codes.issue.help': 'Find the patient first. A new code replaces any unused code for this patient.',
  'codes.empty.hint.nurse': 'Search for a patient above to issue the first code.',
  'codes.empty.hint.admin': 'Codes appear here once a nurse issues them.',
  'codes.empty.find': 'Find a patient',
  'patients.empty.hint': 'Try a different name or phone digits, or check in a walk-in.',
  'patients.clear': 'Clear search',
  'codes.issue.submit': 'Issue code',
  'codes.once': 'This code is shown once. Copy it now and give it to the mother.',
  'codes.valid': 'Valid for 7 days, one use.',
  'codes.copy': 'Copy',
  'codes.copied': 'Copied',
  'codes.close': 'Done',
  'codes.dialog.title': 'Activation code',
  'codes.list': 'Issued codes',
  'codes.col.patient': 'Patient',
  'codes.col.issued': 'Issued',
  'codes.col.expires': 'Expires',
  'codes.col.status': 'Status',
  'codes.status.unused': 'Unused',
  'codes.status.used': 'Used',
  'codes.status.expired': 'Expired',
  'codes.empty': 'No codes issued yet.',
  'codes.error': 'The codes could not be loaded.',
  'codes.failed': 'The code could not be issued.',

  'nav.search': 'Search name or phone digits',
  'nav.search.go': 'Search',
  'nav.walkin': 'Check in walk-in',
  'nav.theme': 'Theme',
  'nav.user': 'Signed in',
  'nav.footer': 'Notice',
  'summary.label': 'Queue summary',
  'summary.walkins': 'Walk-ins',
  'filter.label': 'Filter the queue',
  'filter.all': 'All',
  'queue.checkedin': 'Checked in {time}',
  'queue.filter.empty': 'No entries match this filter.',
  'queue.call.label': 'Call {no}, {name}',
  'queue.inroom.label': 'In room {no}, {name}',
  'queue.done.label': 'Done {no}, {name}',
  'queue.missed.label': 'Missed {no}, {name}',
  'queue.assign.label': 'Assign {no}, {name}',
  'quick.title': 'Quick actions',
  'quick.issue': 'Issue activation code',
  'quick.find': 'Find a patient',
  'quick.codes': 'View activation codes',
  'rooms.title': 'Rooms',
  'rooms.free': 'Free',
  'rooms.inuse': 'In use',
  'rooms.note': 'Status only. The nurse picks the room in Assign.',
  'rooms.empty': 'No rooms set up.',
  'walkin.done': 'Checked in. Queue number {no}.',
  'state.loading': 'Loading',
  'state.offline': 'You are offline or the server cannot be reached. Changes are paused until it is back.',
  'state.offline.short': 'Offline',
  'state.retry': 'Retry',
  'state.close': 'Close',
} as const;

export type Key = keyof typeof EN;

/**
 * NEEDS-NATIVE-REVIEW: every Bahasa Malaysia string is unreviewed by a native speaker until its key is added to MS_REVIEWED.
 * A reviewer signs off per key by listing it here; `msUnreviewed()` returns what is still open (see i18n.spec.ts).
 */
export const MS_REVIEW_STATUS = 'needs-native-review' as const;
export const MS_REVIEWED: ReadonlySet<Key> = new Set<Key>([]);
export const msUnreviewed = (): Key[] => (Object.keys(EN) as Key[]).filter(k => !MS_REVIEWED.has(k));

export const MS: Record<Key, string> = {
  'app.name': 'Buku Pink Digital',
  'app.demo': 'demo',
  'app.skip': 'Langkau ke kandungan utama',
  'notice.full': 'Prototaip untuk demonstrasi. Tidak diluluskan oleh Kementerian Kesihatan Malaysia (KKM). Semua data yang dipaparkan adalah rekaan.',
  'nav.queue': 'Giliran',
  'nav.patients': 'Pesakit',
  'nav.codes': 'Kod',
  'nav.label': 'Navigasi utama',
  'nav.language': 'Bahasa',
  'nav.theme.dark': 'Tema gelap',
  'nav.theme.light': 'Tema cerah',
  'nav.logout': 'Log keluar',
  'role.nurse': 'Jururawat',
  'role.clinic_admin': 'Pentadbir klinik',
  'role.readonly': 'Paparan baca sahaja',

  'login.title': 'Log masuk kakitangan',
  'login.username': 'Nama pengguna',
  'login.password': 'Kata laluan',
  'login.submit': 'Log masuk',
  'login.error': 'Log masuk gagal. Semak maklumat anda atau cuba lagi nanti.',
  'login.expired': 'Sesi anda telah tamat. Sila log masuk semula.',
  'login.busy': 'Sedang log masuk',

  'status.waiting': 'Menunggu',
  'status.called': 'Dipanggil',
  'status.in_room': 'Dalam bilik',
  'status.completed': 'Selesai',
  'status.missed': 'Tidak hadir',
  'status.urgent': 'Segera, ditetapkan kakitangan',

  'queue.title': 'Giliran hari ini',
  'queue.col.no': 'No.',
  'queue.col.name': 'Nama',
  'queue.col.time': 'Daftar masuk',
  'queue.col.status': 'Status',
  'queue.col.room': 'Bilik',
  'queue.col.nurse': 'Jururawat',
  'queue.col.actions': 'Tindakan',
  'queue.walkin': 'Tanpa temujanji',
  'queue.empty': 'Belum ada sesiapa yang mendaftar masuk.',
  'queue.empty.action': 'Daftar masuk pesakit',
  'queue.error': 'Giliran tidak dapat dimuatkan.',
  'queue.retry': 'Cuba lagi',
  'queue.call': 'Panggil',
  'queue.inroom': 'Dalam bilik',
  'queue.complete': 'Selesai',
  'queue.missed': 'Tidak hadir',
  'queue.assign': 'Tetapkan',
  'queue.unassigned': 'Belum ditetapkan',
  'queue.order': 'Dipaparkan mengikut susunan daftar masuk. Kakitangan menentukan siapa dipanggil.',
  'queue.updated': 'Dikemas kini {time}',
  'queue.readonly': 'Anda boleh melihat giliran tetapi tidak boleh mengubahnya.',
  'queue.row.label': 'Giliran {no}, {name}, {status}',
  'queue.action.failed': 'Perubahan tidak disimpan. Cuba lagi.',
  'queue.action.conflict': 'Perubahan itu tidak dibenarkan untuk entri ini.',

  'assign.title': 'Tetapkan entri {no}',
  'assign.room': 'Bilik',
  'assign.nurse': 'Jururawat',
  'assign.none': 'Tiada perubahan',
  'assign.urgent': 'Tandakan sebagai segera (keputusan kakitangan)',
  'assign.urgent.note': 'Hanya kakitangan yang menetapkan ini. Sistem tidak pernah menetapkan kesegeraan.',
  'assign.urgent.reason': 'Sebab segera',
  'assign.urgent.required': 'Pilih satu sebab untuk menandakan segera.',
  'assign.note': 'Menyimpan tidak mengubah status. Gunakan butang Panggil untuk memanggil.',
  'assign.save': 'Simpan',
  'assign.cancel': 'Batal',
  'reason.staff_judgement': 'Pertimbangan kakitangan',
  'reason.accessibility_need': 'Keperluan akses',
  'reason.family_request': 'Permintaan keluarga',
  'reason.other': 'Lain-lain',
  'reason.no_answer': 'Tiada jawapan semasa dipanggil',
  'reason.left_clinic': 'Telah meninggalkan klinik',

  'missed.title': 'Tandakan entri {no} sebagai tidak hadir',
  'missed.reason': 'Sebab',
  'missed.required': 'Pilih satu sebab.',
  'missed.confirm': 'Tandakan tidak hadir',

  'patients.title': 'Pesakit',
  'patients.search': 'Cari nama atau digit telefon',
  'patients.min': 'Taip sekurang-kurangnya 2 aksara untuk mencari.',
  'patients.empty': 'Tiada pesakit sepadan dengan carian anda.',
  'patients.appt': 'Temujanji {time}, {type}',
  'patients.noappt': 'Tiada temujanji hari ini',
  'patients.checkin': 'Daftar masuk',
  'patients.issue': 'Keluarkan kod',
  'patients.error': 'Carian gagal.',
  'patients.checkedin': 'Telah didaftarkan. Nombor giliran {no}.',
  'patients.walkin.title': 'Pesakit tanpa rekod',
  'patients.walkin.name': 'Nama pesakit tanpa rekod',
  'patients.walkin.hint': 'Nama sahaja. Nombor telefon tidak disimpan.',
  'patients.walkin.submit': 'Daftar masuk pesakit tanpa rekod',
  'visit.routine': 'Rutin',
  'visit.booking': 'Tempahan',
  'visit.virtual': 'Maya',

  'codes.title': 'Kod pengaktifan',
  'codes.issue.title': 'Keluarkan kod',
  'codes.issue.help': 'Cari pesakit dahulu. Kod baharu menggantikan sebarang kod yang belum digunakan untuk pesakit ini.',
  'codes.empty.hint.nurse': 'Cari pesakit di atas untuk mengeluarkan kod pertama.',
  'codes.empty.hint.admin': 'Kod akan dipaparkan di sini selepas jururawat mengeluarkannya.',
  'codes.empty.find': 'Cari pesakit',
  'patients.empty.hint': 'Cuba nama atau digit telefon lain, atau daftar masuk pesakit tanpa rekod.',
  'patients.clear': 'Kosongkan carian',
  'codes.issue.submit': 'Keluarkan kod',
  'codes.once': 'Kod ini dipaparkan sekali sahaja. Salin sekarang dan berikan kepada ibu.',
  'codes.valid': 'Sah selama 7 hari, satu kali guna.',
  'codes.copy': 'Salin',
  'codes.copied': 'Disalin',
  'codes.close': 'Selesai',
  'codes.dialog.title': 'Kod pengaktifan',
  'codes.list': 'Kod yang dikeluarkan',
  'codes.col.patient': 'Pesakit',
  'codes.col.issued': 'Dikeluarkan',
  'codes.col.expires': 'Tamat',
  'codes.col.status': 'Status',
  'codes.status.unused': 'Belum digunakan',
  'codes.status.used': 'Telah digunakan',
  'codes.status.expired': 'Tamat tempoh',
  'codes.empty': 'Belum ada kod dikeluarkan.',
  'codes.error': 'Kod tidak dapat dimuatkan.',
  'codes.failed': 'Kod tidak dapat dikeluarkan.',

  'nav.search': 'Cari nama atau digit telefon',
  'nav.search.go': 'Cari',
  'nav.walkin': 'Daftar masuk tanpa temujanji',
  'nav.theme': 'Tema',
  'nav.user': 'Log masuk sebagai',
  'nav.footer': 'Notis',
  'summary.label': 'Ringkasan giliran',
  'summary.walkins': 'Tanpa temujanji',
  'filter.label': 'Tapis giliran',
  'filter.all': 'Semua',
  'queue.checkedin': 'Daftar masuk {time}',
  'queue.filter.empty': 'Tiada entri sepadan dengan tapisan ini.',
  'queue.call.label': 'Panggil {no}, {name}',
  'queue.inroom.label': 'Dalam bilik {no}, {name}',
  'queue.done.label': 'Selesai {no}, {name}',
  'queue.missed.label': 'Tidak hadir {no}, {name}',
  'queue.assign.label': 'Tetapkan {no}, {name}',
  'quick.title': 'Tindakan pantas',
  'quick.issue': 'Keluarkan kod pengaktifan',
  'quick.find': 'Cari pesakit',
  'quick.codes': 'Lihat kod pengaktifan',
  'rooms.title': 'Bilik',
  'rooms.free': 'Kosong',
  'rooms.inuse': 'Sedang digunakan',
  'rooms.note': 'Status sahaja. Jururawat memilih bilik dalam Tetapkan.',
  'rooms.empty': 'Tiada bilik disediakan.',
  'walkin.done': 'Telah didaftarkan. Nombor giliran {no}.',
  'state.loading': 'Memuatkan',
  'state.offline': 'Anda di luar talian atau pelayan tidak dapat dicapai. Perubahan dijeda sehingga ia kembali.',
  'state.offline.short': 'Luar talian',
  'state.retry': 'Cuba lagi',
  'state.close': 'Tutup',
};

const STORE = 'dbp.lang';

@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.initial());

  private initial(): Lang {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE) : null;
    const l: Lang = saved === 'ms' || saved === 'en' ? saved : 'en';
    if (typeof document !== 'undefined') document.documentElement.lang = l;
    return l;
  }

  set(l: Lang): void {
    this.lang.set(l);
    localStorage.setItem(STORE, l);
    document.documentElement.lang = l;
  }

  /** Reads the language signal, so templates re-render on switch. */
  t(key: Key, params?: Record<string, string | number>): string {
    const s = (this.lang() === 'ms' ? MS : EN)[key] as string;
    return params ? s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')) : s;
  }

  /** Looks up dynamic keys such as status.waiting; falls back to the raw value. */
  tk(prefix: string, value: string): string {
    const key = `${prefix}.${value}` as Key;
    return key in EN ? this.t(key) : value;
  }

  /** UI-layer display name for rooms: the seed names them "Bilik N"; English shows "Room N". Data is unchanged. */
  roomName(name: string): string {
    return this.lang() === 'en' ? name.replace(/^Bilik (\d+)$/, 'Room $1') : name;
  }

  time(iso: string): string {
    return new Intl.DateTimeFormat(this.lang() === 'ms' ? 'ms-MY' : 'en-MY', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date(iso));
  }

  dateTime(iso: string): string {
    return new Intl.DateTimeFormat(this.lang() === 'ms' ? 'ms-MY' : 'en-MY', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur',
    }).format(new Date(iso));
  }
}
