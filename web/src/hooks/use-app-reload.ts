import { useCallback } from 'react';
import { useAppStore, type ReloadKey } from '@/store/app-store';

/** Sinkronkan data dari API tanpa loading skeleton (setelah simpan/hapus). */
export function useAppReload() {
  const reload = useAppStore((s) => s.reload);
  return useCallback((keys: ReloadKey | ReloadKey[]) => reload(keys), [reload]);
}
