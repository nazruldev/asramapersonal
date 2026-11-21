import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/theme';
import { initClientApiStore, installNativeApiFetch } from './lib/client-api';
import { setWebSqliteAvailable } from './lib/offline-db';
import { startAutoSync, runTursoPull } from './lib/sync/turso-sync';
import { startAblyPushNotifications } from './lib/sync/ably-push';
import { notifyAppReady } from './lib/app-update';
import './index.css';
import App from './App.tsx';
import { OtaUpdatePrompt } from './components/ota-update-prompt';
import { Toaster } from './components/ui/sonner';

const queryClient = new QueryClient();

// Tandai runtime Electron — dipakai CSS (mis. sembunyikan scrollbar).
if (/Electron/.test(navigator.userAgent)) {
  document.documentElement.classList.add('electron-app');
}

async function bootstrap() {
  // Capgo: konfirmasi bundle SEBELUM init berat. Kalau menunggu Turso/store dulu
  // dan init gagal, Capgo auto-rollback ke bundle lama → sheet update muncul terus.
  await notifyAppReady();

  // Full-online Turso: RAM kerja + cloud sebagai sumber kebenaran.
  setWebSqliteAvailable(false);
  installNativeApiFetch();
  await initClientApiStore();
  // Auto-pull jalan; push tetap di-gate sampai hydrate/bootstrap sukses.
  startAutoSync();
  // Android: FCM push. Electron/web: Ably websocket (+ Notification API jika diizinkan).
  void startAblyPushNotifications(() => {
    void runTursoPull().catch((err) => {
      console.warn('[push] sync after notification failed:', err);
    });
  });
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => undefined);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <App />
            <OtaUpdatePrompt />
            <Toaster />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

void bootstrap().catch((err) => {
  console.error('App bootstrap failed:', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<p style="padding:1.5rem;font-family:sans-serif">Gagal memulai aplikasi. Periksa konsol.</p>';
  }
});
