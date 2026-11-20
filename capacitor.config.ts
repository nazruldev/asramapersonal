import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.asramapersonal.app',
  appName: 'Asrama Manager',
  webDir: 'web/dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorUpdater: {
      // OTA manual: app sendiri yang fetch GitHub Release & download bundle.
      autoUpdate: false,
      appReadyTimeout: 120000,
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
};

export default config;
