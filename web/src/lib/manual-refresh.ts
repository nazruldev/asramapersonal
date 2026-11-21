import { useAppStore } from '@/store/app-store';
import { useOtaUpdateCheck } from '@/lib/ota-update-check';

/**
 * Sync Turso (jika dikonfigurasi) lalu reload seluruh store.
 * Dipakai tombol refresh desktop / shortcut F5 — setara pull-to-refresh.
 */
export async function runManualRefresh(): Promise<void> {
  const { isTursoConfigured } = await import('@/lib/sync/cloud-bootstrap');
  if (!isTursoConfigured()) {
    throw new Error('Turso wajib dikonfigurasi');
  }
  const { runTursoSync } = await import('@/lib/sync/turso-sync');
  await runTursoSync();
  // Pembayaran tabel terpisah — ikut di-pull saat refresh global.
  const { pullPembayaranFromTurso } = await import('@/lib/pembayaran-store');
  await pullPembayaranFromTurso();
  await useAppStore.getState().reloadAll();
  void useOtaUpdateCheck.getState().check();
}
