import { useAppStore, type ReloadKey } from '@/store/app-store';

/** True sampai key pernah selesai di-reload (hindari flash "kosong" saat fetch). */
export function useReloadKeyReady(key: ReloadKey): boolean {
  return useAppStore((s) => s.loadedKeys[key] === true);
}

export function useReloadKeyLoading(key: ReloadKey): boolean {
  return useAppStore((s) => s.loadingKeys[key] === true);
}
