import type { CapacitorConfig } from '@capacitor/cli';

// PWA first. Native platforms (ios/android) are added only after approval, with the QR scanning and secure-storage plugins licence-checked.
const config: CapacitorConfig = {
  appId: 'my.example.bukupink',
  appName: 'Digital Buku Pink',
  webDir: 'dist/mobile/browser',
};

export default config;
