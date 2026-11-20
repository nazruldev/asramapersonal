import { useCallback } from 'react';
import { useAppReload } from '@/hooks/use-app-reload';
import type { ReloadKey } from '@/store/app-store';

/** Pull-to-refresh: muat ulang entitas dari API lokal. */
export function usePageRefresh(...keys: ReloadKey[]) {
  const reload = useAppReload();
  const signature = keys.join('|');
  return useCallback(async () => {
    await reload(keys);
  }, [reload, signature]);
}
