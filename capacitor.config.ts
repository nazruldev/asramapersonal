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
      // dist.zip ~10MB+ (ada wilyah.sqlite); timeout idle default 20s sering putus.
      responseTimeout: 120,
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
};

export default config;
