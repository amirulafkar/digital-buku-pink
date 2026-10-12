import { Injectable, signal } from '@angular/core';

export type Lang = 'ms' | 'en';

/**
 * English source strings. Every key must exist in MS (enforced by the type). Placeholders use {name}.
 * Product rules: no estimated waiting time, nothing that suggests the system sets priority.
 */
export const EN = {
  'app.name': 'Digital Buku Pink',
  'app.skip': 'Skip to main content',
  'title.activate': 'Activate',
  'title.login': 'Log in',
  'title.home': 'Home',
  'title.scan': 'Check in',
  'title.confirmation': 'Check-in complete',
  'title.status': 'Your visit',
  'title.settings': 'Settings',
  'notice.full': 'Prototype for demonstration. Not approved by the Ministry of Health (MOH). All data shown is fictional.',
  'safety.text': '[PLACEHOLDER, NEEDS MOH APPROVAL] Tell staff immediately or go to a hospital if you are worried.',
  'safety.label': 'Safety notice',
  'nav.label': 'Main navigation',
  'nav.home': 'Home',
  'nav.scan': 'Scan',
  'nav.status': 'Status',
  'nav.settings': 'Settings',
  'nav.language': 'Language',
  'nav.theme.dark': 'Switch to dark theme',
  'nav.theme.light': 'Switch to light theme',

  'activate.title': 'Activate your account',
  'activate.intro': 'Ask the counter for an activation code, then choose a password.',
  'activate.code': 'Activation code',
  'activate.phone': 'Phone number',
  'activate.password': 'Password (at least 8 characters)',
  'activate.submit': 'Activate',
  'activate.busy': 'Activating',
  'activate.error': 'Code invalid or expired. Ask the counter for a new one.',
  'activate.short': 'The password needs at least 8 characters.',
  'activate.have': 'Already activated?',
  'activate.gologin': 'Log in',

  'login.title': 'Log in',
  'login.phone': 'Phone number',
  'login.password': 'Password',
  'login.submit': 'Log in',
  'login.busy': 'Logging in',
  'login.error': 'Phone or password is not right.',
  'login.ready': 'Account ready, log in.',
  'login.expired': 'Please log in again.',
  'login.new': 'First time here?',
  'login.goactivate': 'Activate your account',
  'login.toomany': 'Too many tries. Wait a minute.',
  'login.network': 'No connection. Try again.',

  'home.hello': 'Hello, {name}',
  'home.clinic': 'Clinic: {clinic}',
  'home.appt.title': 'Your next appointment',
  'home.appt.at': '{date}, {time}',
  'home.appt.none': 'No appointment listed. Your clinic adds them.',
  'home.checkin': 'Check in with QR',
  'home.error': 'Could not load your details.',
  'visit.routine': 'Routine visit',
  'visit.booking': 'Booking',
  'visit.virtual': 'Virtual visit',

  'scan.title': 'Check in',
  'scan.intro': 'Point the camera at the QR code at the counter.',
  'scan.start': 'Open camera',
  'scan.stop': 'Close camera',
  'scan.denied': 'Camera is off. Allow the camera in your browser or device settings, then try again.',
  'scan.ask': "Can't scan? Ask staff",
  'scan.ask.text': 'Ask staff at the counter to check you in. They can do it for you.',
  'scan.unsupported': 'This device cannot scan here. Ask staff at the counter.',
  'scan.busy': 'Checking in',
  'scan.retry': 'Try again',
  'scan.offline': 'You are offline. Scanning is paused until you are back online.',
  'scan.err.token_invalid': 'This code has expired. Scan the current one.',
  'scan.err.wrong_clinic': 'This code is for another clinic. Ask staff.',
  'scan.err.no_appointment_today': 'No appointment found. Please ask staff.',
  'scan.err.rate': 'Too many tries. Wait a minute.',
  'scan.err.network': 'No connection. Your check-in was not confirmed. Try again.',
  'scan.err.other': 'Something went wrong. Ask staff at the counter.',

  'confirm.title': 'Check-in complete',
  'confirm.text': 'Checked in. Your number is {no}.',
  'confirm.hint': 'Keep this screen or open Status to follow your visit.',
  'confirm.status': 'Open status',

  'status.title': 'Your visit',
  'status.number': 'Your number',
  'status.none': 'You have not checked in yet.',
  'status.goscan': 'Check in with QR',
  'status.step.waiting': 'Waiting',
  'status.step.called': 'Called',
  'status.step.in_room': 'In room',
  'status.step.completed': 'Done',
  'status.steps': 'Visit steps',
  'status.current': 'current step',
  'status.now': 'Now',
  'status.missed': 'You missed your call. Tell the counter.',
  'status.unknown': 'Status unavailable. Ask the counter.',
  'status.room': 'Go to {room}.',
  'status.order': 'Staff decide the order. This app does not estimate waiting time.',
  'status.updated': 'Last updated {time}',
  'status.error': 'Could not refresh. Showing the last known status.',
  'status.nodata': 'Could not load your visit. Try again.',
  'status.retry': 'Refresh now',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.privacy.title': 'Privacy',
  'settings.privacy.text': 'This app keeps only your name, appointment and queue number. It does not store your phone number or password. Your sign-in lasts only while the app is open.',
  'settings.logout': 'Log out',
  'settings.version': 'Prototype for demonstration',

  'state.loading': 'Loading',
  'state.offline': 'You are offline. Showing the last known status. Go to the counter if you need help.',
  'live.on': 'Live',
  'live.reconnecting': 'Reconnecting...',
  'live.off': 'Live updates are off. Refreshing every 15 seconds.',
  'status.announce': 'Your status is now {status}.',
  'state.retry': 'Retry',
} as const;

export type Key = keyof typeof EN;

/**
 * NEEDS-NATIVE-REVIEW: every Bahasa Malaysia string is unreviewed until its key is listed in MS_REVIEWED.
 * `msUnreviewed()` returns what is still open (see i18n.spec.ts).
 */
export const MS_REVIEW_STATUS = 'needs-native-review' as const;
export const MS_REVIEWED: ReadonlySet<Key> = new Set<Key>([]);
export const msUnreviewed = (): Key[] => (Object.keys(EN) as Key[]).filter(k => !MS_REVIEWED.has(k));

export const MS: Record<Key, string> = {
  'app.name': 'Digital Buku Pink', // a name is not translated
  'app.skip': 'Langkau ke kandungan utama',
  'title.activate': 'Aktifkan',
  'title.login': 'Log masuk',
  'title.home': 'Utama',
  'title.scan': 'Daftar masuk',
  'title.confirmation': 'Pendaftaran selesai',
  'title.status': 'Lawatan anda',
  'title.settings': 'Tetapan',
  'notice.full': 'Prototaip untuk demonstrasi. Tidak diluluskan oleh Kementerian Kesihatan Malaysia (KKM). Semua data yang dipaparkan adalah rekaan.',
  'safety.text': '[PLACEHOLDER, NEEDS MOH APPROVAL] Beritahu kakitangan dengan segera atau pergi ke hospital jika anda risau.',
  'safety.label': 'Notis keselamatan',
  'nav.label': 'Navigasi utama',
  'nav.home': 'Utama',
  'nav.scan': 'Imbas',
  'nav.status': 'Status',
  'nav.settings': 'Tetapan',
  'nav.language': 'Bahasa',
  'nav.theme.dark': 'Tukar ke tema gelap',
  'nav.theme.light': 'Tukar ke tema cerah',

  'activate.title': 'Aktifkan akaun anda',
  'activate.intro': 'Minta kod pengaktifan di kaunter, kemudian pilih kata laluan.',
  'activate.code': 'Kod pengaktifan',
  'activate.phone': 'Nombor telefon',
  'activate.password': 'Kata laluan (sekurang-kurangnya 8 aksara)',
  'activate.submit': 'Aktifkan',
  'activate.busy': 'Sedang mengaktifkan',
  'activate.error': 'Kod tidak sah atau telah tamat. Minta kod baharu di kaunter.',
  'activate.short': 'Kata laluan memerlukan sekurang-kurangnya 8 aksara.',
  'activate.have': 'Sudah diaktifkan?',
  'activate.gologin': 'Log masuk',

  'login.title': 'Log masuk',
  'login.phone': 'Nombor telefon',
  'login.password': 'Kata laluan',
  'login.submit': 'Log masuk',
  'login.busy': 'Sedang log masuk',
  'login.error': 'Nombor telefon atau kata laluan tidak betul.',
  'login.ready': 'Akaun sedia, sila log masuk.',
  'login.expired': 'Sila log masuk semula.',
  'login.new': 'Kali pertama di sini?',
  'login.goactivate': 'Aktifkan akaun anda',
  'login.toomany': 'Terlalu banyak percubaan. Tunggu seminit.',
  'login.network': 'Tiada sambungan. Cuba lagi.',

  'home.hello': 'Helo, {name}',
  'home.clinic': 'Klinik: {clinic}',
  'home.appt.title': 'Temujanji anda yang seterusnya',
  'home.appt.at': '{date}, {time}',
  'home.appt.none': 'Tiada temujanji disenaraikan. Klinik anda yang menambahnya.',
  'home.checkin': 'Daftar masuk dengan QR',
  'home.error': 'Maklumat anda tidak dapat dimuatkan.',
  'visit.routine': 'Lawatan rutin',
  'visit.booking': 'Tempahan',
  'visit.virtual': 'Lawatan maya',

  'scan.title': 'Daftar masuk',
  'scan.intro': 'Halakan kamera ke kod QR di kaunter.',
  'scan.start': 'Buka kamera',
  'scan.stop': 'Tutup kamera',
  'scan.denied': 'Kamera ditutup. Benarkan kamera dalam tetapan pelayar atau peranti anda, kemudian cuba lagi.',
  'scan.ask': 'Tak boleh imbas? Tanya kakitangan',
  'scan.ask.text': 'Minta kakitangan di kaunter mendaftarkan anda. Mereka boleh melakukannya untuk anda.',
  'scan.unsupported': 'Peranti ini tidak dapat mengimbas di sini. Tanya kakitangan di kaunter.',
  'scan.busy': 'Sedang mendaftar masuk',
  'scan.retry': 'Cuba lagi',
  'scan.offline': 'Anda di luar talian. Pengimbasan dijeda sehingga anda kembali dalam talian.',
  'scan.err.token_invalid': 'Kod ini telah tamat. Imbas kod yang terkini.',
  'scan.err.wrong_clinic': 'Kod ini untuk klinik lain. Tanya kakitangan.',
  'scan.err.no_appointment_today': 'Tiada temujanji dijumpai. Sila tanya kakitangan.',
  'scan.err.rate': 'Terlalu banyak percubaan. Tunggu seminit.',
  'scan.err.network': 'Tiada sambungan. Pendaftaran anda belum disahkan. Cuba lagi.',
  'scan.err.other': 'Sesuatu tidak kena. Tanya kakitangan di kaunter.',

  'confirm.title': 'Pendaftaran selesai',
  'confirm.text': 'Telah didaftarkan. Nombor anda ialah {no}.',
  'confirm.hint': 'Simpan skrin ini atau buka Status untuk mengikuti lawatan anda.',
  'confirm.status': 'Buka status',

  'status.title': 'Lawatan anda',
  'status.number': 'Nombor anda',
  'status.none': 'Anda belum mendaftar masuk.',
  'status.goscan': 'Daftar masuk dengan QR',
  'status.step.waiting': 'Menunggu',
  'status.step.called': 'Dipanggil',
  'status.step.in_room': 'Dalam bilik',
  'status.step.completed': 'Selesai',
  'status.steps': 'Langkah lawatan',
  'status.current': 'langkah semasa',
  'status.now': 'Sekarang',
  'status.missed': 'Anda terlepas panggilan. Beritahu kaunter.',
  'status.unknown': 'Status tidak tersedia. Tanya kaunter.',
  'status.room': 'Pergi ke {room}.',
  'status.order': 'Kakitangan menentukan susunan. Aplikasi ini tidak menganggarkan masa menunggu.',
  'status.updated': 'Dikemas kini {time}',
  'status.error': 'Tidak dapat menyegarkan. Memaparkan status terakhir yang diketahui.',
  'status.nodata': 'Lawatan anda tidak dapat dimuatkan. Cuba lagi.',
  'status.retry': 'Segarkan sekarang',

  'settings.title': 'Tetapan',
  'settings.language': 'Bahasa',
  'settings.privacy.title': 'Privasi',
  'settings.privacy.text': 'Aplikasi ini hanya menyimpan nama, temujanji dan nombor giliran anda. Ia tidak menyimpan nombor telefon atau kata laluan anda. Log masuk anda hanya kekal semasa aplikasi dibuka.',
  'settings.logout': 'Log keluar',
  'settings.version': 'Prototaip untuk demonstrasi',

  'state.loading': 'Memuatkan',
  'state.offline': 'Anda di luar talian. Memaparkan status terakhir yang diketahui. Pergi ke kaunter jika anda perlukan bantuan.',
  'live.on': 'Langsung',
  'live.reconnecting': 'Menyambung semula...',
  'live.off': 'Kemas kini langsung dimatikan. Menyegarkan setiap 15 saat.',
  'status.announce': 'Status anda kini {status}.',
  'state.retry': 'Cuba lagi',
};

const STORE = 'dbp.m.lang'; // device-local language preference only (not personal data)

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

  t(key: Key, params?: Record<string, string | number>): string {
    const s = (this.lang() === 'ms' ? MS : EN)[key] as string;
    return params ? s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')) : s;
  }

  tk(prefix: string, value: string, fallback?: Key): string {
    const key = `${prefix}.${value}` as Key;
    return key in EN ? this.t(key) : fallback ? this.t(fallback) : value;
  }

  private loc() { return this.lang() === 'ms' ? 'ms-MY' : 'en-MY'; }

  time(iso: string): string {
    return new Intl.DateTimeFormat(this.loc(), { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(iso));
  }

  date(iso: string): string {
    return new Intl.DateTimeFormat(this.loc(), { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(iso));
  }
}
