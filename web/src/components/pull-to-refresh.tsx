import { useCallback, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOtaUpdateCheck } from '@/lib/ota-update-check';

type Props = {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

const THRESHOLD_PX = 72;
const INDICATOR_SIZE = 36;

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
  const visible = pull > 4 || refreshing;
  // Posisi indikator: muncul dari atas mengikuti tarikan, menetap saat refresh.
  const indicatorY = refreshing ? 12 : -INDICATOR_SIZE + Math.min(pull, THRESHOLD_PX) * 0.7;
  const contentShift = refreshing ? INDICATOR_SIZE + 20 : pull * 0.5;

  return (
    <div
      className="relative w-full min-h-0 overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Indikator spinner melayang di atas konten (pola umum PTR). */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 top-0 z-20 flex items-center justify-center rounded-full border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-800',
          visible ? 'opacity-100' : 'opacity-0',
          pulling.current ? 'transition-none' : 'transition-all duration-200',
        )}
        style={{
          width: INDICATOR_SIZE,
          height: INDICATOR_SIZE,
          transform: `translate(-50%, ${indicatorY}px) scale(${refreshing ? 1 : 0.5 + progress * 0.5})`,
        }}
        aria-live="polite"
        aria-hidden={!visible}
      >
        <RefreshCw
          className={cn('size-4 text-slate-600 dark:text-slate-300', refreshing && 'animate-spin')}
          style={refreshing ? undefined : { transform: `rotate(${progress * 360}deg)` }}
        />
      </div>
      <div
        className={cn('w-full', pulling.current ? 'transition-none' : 'transition-transform duration-200', className)}
        style={{ transform: `translateY(${contentShift}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
