import { useCallback, type ReactNode } from 'react';
import { PullToRefresh } from '@/components/pull-to-refresh';
import { usePageRefresh } from '@/hooks/use-page-refresh';
import type { ReloadKey } from '@/store/app-store';

type Props = {
  keys: ReloadKey[];
  children: ReactNode;
  className?: string;
  /** Muat ulang tambahan (mis. pagination / absensi hari ini). */
  extraRefresh?: () => Promise<void>;
  disabled?: boolean;
};

export function PageWithPullRefresh({
  keys,
  children,
  className,
  extraRefresh,
  disabled,
}: Props) {
  const reloadKeys = usePageRefresh(...keys);
  const onRefresh = useCallback(async () => {
    await reloadKeys();
    if (extraRefresh) await extraRefresh();
  }, [reloadKeys, extraRefresh]);
  return (
    <PullToRefresh onRefresh={onRefresh} className={className} disabled={disabled}>
      {children}
    </PullToRefresh>
  );
}
