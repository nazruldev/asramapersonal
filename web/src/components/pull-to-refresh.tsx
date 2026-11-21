import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOtaUpdateCheck } from '@/lib/ota-update-check';
import { getPagePullRefresh } from '@/lib/page-pull-refresh';

type Props = {
  /** Area scroll utama (main). */
  scrollRef: RefObject<HTMLElement | null>;
  /** Shell yang membungkus header + main — gesture & indikator di sini. */
  shellRef: RefObject<HTMLElement | null>;
};

/** Tarik sejauh ini dulu baru PTR mengunci gesture (hindari salah picu). */
const ACTIVATION_PX = 28;
/** Jarak teredam (setelah damping) untuk memicu refresh. */
const THRESHOLD_PX = 52;
const MAX_PULL_PX = 88;
const INDICATOR_SIZE = 32;
/** Redam jarak jari → jarak indikator (kurang agresif). */
const DAMPING = 0.4;

function scrollTopOf(el: HTMLElement | null): number {
  return el?.scrollTop ?? 0;
}

/**
 * Pull-to-refresh level shell: indikator di status bar/header,
 * tidak menggeser konten halaman, gesture lebih redam.
 */
export function ShellPullToRefresh({ scrollRef, shellRef }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const armed = useRef(false);
  const engaged = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    const { handler, disabled } = getPagePullRefresh();
    if (disabled || !handler) return;

    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await handler();
      void useOtaUpdateCheck.getState().check();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPull(0);
      pullRef.current = 0;
      engaged.current = false;
    }
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const reset = () => {
      armed.current = false;
      engaged.current = false;
      pullRef.current = 0;
      setPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const { disabled, handler } = getPagePullRefresh();
      if (disabled || !handler) return;

      if (scrollTopOf(scrollRef.current) > 0) return;

      startY.current = e.touches[0]?.clientY ?? 0;
      armed.current = true;
      engaged.current = false;
      pullRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current || refreshingRef.current) return;
      if (scrollTopOf(scrollRef.current) > 0) {
        reset();
        return;
      }

      const y = e.touches[0]?.clientY ?? 0;
      const raw = Math.max(0, y - startY.current);
      if (raw <= 0) {
        if (engaged.current) {
          pullRef.current = 0;
          setPull(0);
          engaged.current = false;
        }
        return;
      }

      if (!engaged.current) {
        if (raw < ACTIVATION_PX) return;
        engaged.current = true;
      }

      if (e.cancelable) e.preventDefault();
      // Rubber-band: jari jauh, indikator bergerak pelan.
      const damped = Math.min(MAX_PULL_PX, (raw - ACTIVATION_PX) * DAMPING);
      pullRef.current = damped;
      setPull(damped);
    };

    const onTouchEnd = () => {
      if (!armed.current) return;
      const released = pullRef.current;
      const wasEngaged = engaged.current;
      armed.current = false;
      engaged.current = false;

      if (wasEngaged && released >= THRESHOLD_PX) {
        void runRefresh();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };

    shell.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    shell.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    shell.addEventListener('touchend', onTouchEnd, { capture: true });
    shell.addEventListener('touchcancel', onTouchEnd, { capture: true });
    return () => {
      shell.removeEventListener('touchstart', onTouchStart, true);
      shell.removeEventListener('touchmove', onTouchMove, true);
      shell.removeEventListener('touchend', onTouchEnd, true);
      shell.removeEventListener('touchcancel', onTouchEnd, true);
    };
  }, [runRefresh, scrollRef, shellRef]);

  const progress = Math.min(1, pull / THRESHOLD_PX);
  const visible = pull > 6 || refreshing;
  const indicatorY = refreshing
    ? 10
    : -INDICATOR_SIZE + 8 + Math.min(pull, THRESHOLD_PX) * 0.55;

  return (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 z-[60] flex items-center justify-center rounded-full border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-800',
        visible ? 'opacity-100' : 'opacity-0',
        refreshing ? 'transition-all duration-200' : 'transition-[opacity,transform] duration-150'
      )}
      style={{
        width: INDICATOR_SIZE,
        height: INDICATOR_SIZE,
        top: 'max(0.35rem, env(safe-area-inset-top))',
        transform: `translate(-50%, ${indicatorY}px) scale(${refreshing ? 1 : 0.55 + progress * 0.45})`,
      }}
      aria-live="polite"
      aria-hidden={!visible}
    >
      <RefreshCw
        className={cn('size-3.5 text-slate-600 dark:text-slate-300', refreshing && 'animate-spin')}
        style={refreshing ? undefined : { transform: `rotate(${progress * 280}deg)` }}
      />
    </div>
  );
}
