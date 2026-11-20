import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './lib/theme';
import { initClientApiStore, installNativeApiFetch } from './lib/client-api';
import { setWebSqliteAvailable } from './lib/offline-db';
import { startAutoSync } from './lib/sync/turso-sync';
import { notifyAppReady, checkForOtaUpdate } from './lib/app-update';
import './index.css';
import App from './App.tsx';
import { Toaster } from './components/ui/sonner';

const queryClient = new QueryClient();

async function bootstrap() {
  // Web/Electron: localStorage. Android: Capacitor SQLite.
  // Sync penuh semua platform lewat Turso snapshot.
  setWebSqliteAvailable(false);
  installNativeApiFetch();
  await initClientApiStore();
  startAutoSync();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <App />
            <Toaster />
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  );

  // OTA Android: konfirmasi bundle aktif lalu cek update dari GitHub Release.
  void notifyAppReady().then(() => checkForOtaUpdate());
}

void bootstrap().catch((err) => {
  console.error('App bootstrap failed:', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML =
      '<p style="padding:1.5rem;font-family:sans-serif">Gagal memulai aplikasi. Periksa konsol.</p>';
  }
});
