import { useCallback, useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { usePageRefresh } from '@/hooks/use-page-refresh';
import { activatePagePullRefresh, setPagePullRefresh } from '@/lib/page-pull-refresh';
import type { ReloadKey } from '@/store/app-store';
import { cn } from '@/lib/utils';

type Props = {
  keys: ReloadKey[];
  children: ReactNode;
  className?: string;
  /** Muat ulang tambahan (mis. pagination / absensi hari ini). */
  extraRefresh?: () => Promise<void>;
  disabled?: boolean;
};

/**
 * Mendaftarkan handler refresh halaman ke shell PTR.
 * Gesture & indikator ada di header/status bar — bukan menggeser konten.
 */
export function PageWithPullRefresh({
  keys,
  children,
  className,
  extraRefresh,
  disabled,
}: Props) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const reloadKeys = usePageRefresh(...keys);

  const onRefresh = useCallback(async () => {
    const { isTursoConfigured } = await import('@/lib/sync/cloud-bootstrap');
    if (isTursoConfigured()) {
      const { runTursoSync } = await import('@/lib/sync/turso-sync');
      await runTursoSync();
      const { pullPembayaranFromTurso } = await import('@/lib/pembayaran-store');
      await pullPembayaranFromTurso();
    }
    await reloadKeys();
    if (extraRefresh) await extraRefresh();
  }, [reloadKeys, extraRefresh]);

  useEffect(() => {
    setPagePullRefresh(id, onRefresh, !!disabled);
    return () => setPagePullRefresh(id, null);
  }, [id, onRefresh, disabled]);

  // KeepAlive: aktifkan hanya halaman yang terlihat (bukan aria-hidden).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!el.closest('[aria-hidden="true"]')) {
      activatePagePullRefresh(id);
    }
  }, [id, location.pathname, location.key]);

  return (
    <div ref={rootRef} className={cn('w-full', className)}>
      {children}
    </div>
  );
}
