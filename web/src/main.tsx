import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/theme';
import { initClientApiStore, installNativeApiFetch } from './lib/client-api';
import { setWebSqliteAvailable } from './lib/offline-db';
import { startAutoSync } from './lib/sync/turso-sync';
import { notifyAppReady } from './lib/app-update';
import './index.css';
import App from './App.tsx';
import { OtaUpdatePrompt } from './components/ota-update-prompt';
import { Toaster } from './components/ui/sonner';

const queryClient = new QueryClient();

async function bootstrap() {
  const boot = (msg: string) => {
    console.info('[boot]', msg);
    const el = document.getElementById('root');
    if (el && !el.childElementCount) {
      el.innerHTML = `<p style="padding:1.5rem;font-family:sans-serif;color:#64748b">${msg}</p>`;
    }
  };
  // Web/Electron: localStorage. Android: Capacitor SQLite.
  // Sync penuh semua platform lewat Turso snapshot.
  boot('1/5 setWebSqlite…');
  setWebSqliteAvailable(false);
  boot('2/5 installNativeApiFetch…');
  installNativeApiFetch();
  boot('3/5 initClientApiStore…');
  await initClientApiStore();
  boot('4/5 startAutoSync…');
  startAutoSync();
  boot('5/5 render…');

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

  // OTA Android: konfirmasi bundle aktif; pengecekan update + popup di OtaUpdatePrompt.
  void notifyAppReady();
}

void bootstrap().catch((err) => {
  console.error('App bootstrap failed:', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<p style="padding:1.5rem;font-family:sans-serif">Gagal memulai aplikasi. Periksa konsol.</p>';
  }
});
