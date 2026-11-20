import { useCallback, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useOtaUpdateCheck } from '@/lib/ota-update-check';

type Props = {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

const THRESHOLD_PX = 72;

/** Cek apakah area scroll (biasanya `<main>`) masih di atas — untuk PTR tanpa nested scroll. */
function scrollParentOffsetTop(el: HTMLElement): number {
  let node: HTMLElement | null = el;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    const canScroll =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      node.scrollHeight > node.clientHeight + 1;
    if (canScroll) return node.scrollTop;
    node = node.parentElement;
  }
  return 0;
}

export function PullToRefresh({ onRefresh, children, className, disabled }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current || disabled) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await onRefresh();
      // Sekalian cek update OTA (di-non-native otomatis no-op).
      void useOtaUpdateCheck.getState().check();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
      pullRef.current = 0;
    }
  }, [disabled, onRefresh]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (disabled || refreshingRef.current) return;
    const el = e.currentTarget as HTMLElement;
    if (scrollParentOffsetTop(el) > 0) return;
    startY.current = e.touches[0]?.clientY ?? 0;
    pulling.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!pulling.current || disabled || refreshingRef.current) return;
    const y = e.touches[0]?.clientY ?? 0;
    const delta = Math.max(0, y - startY.current);
    const next = Math.min(delta, THRESHOLD_PX * 1.4);
    pullRef.current = next;
    setPull(next);
  };

  const onTouchEnd = () => {
    if (!pulling.current) return;
    pulling.current = false;
    const released = pullRef.current;
    if (released >= THRESHOLD_PX) {
      void runRefresh();
    } else {
      pullRef.current = 0;
      setPull(0);
    }
  };

  const progress = Math.min(1, pull / THRESHOLD_PX);

  return (
    <div
      className="relative w-full min-h-0"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden text-xs font-medium text-slate-500 dark:text-slate-400 transition-[height] duration-150"
        style={{ height: refreshing ? 40 : pull > 4 ? pull * 0.45 : 0 }}
        aria-live="polite"
      >
        {refreshing ? 'Memuat ulang…' : progress >= 1 ? 'Lepas untuk memuat ulang' : progress > 0.2 ? 'Tarik untuk memuat ulang' : ''}
      </div>
      <div className={cn('w-full', className)}>{children}</div>
    </div>
  );
}
