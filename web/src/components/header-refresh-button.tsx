import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { HeaderIconButton } from '@/components/header-action-button';
import { runManualRefresh } from '@/lib/manual-refresh';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  /** Warna ikon mengikuti header home (opsional). */
  theme?: 'light' | 'dark';
  /** Daftarkan F5 / Ctrl+R (pasang hanya di satu instance). */
  bindShortcut?: boolean;
};

/**
 * Tombol sync+reload untuk desktop/Electron (dan cadangan mobile).
 * Shortcut opsional: F5 / Ctrl+R (saat tidak fokus di input).
 */
export function HeaderRefreshButton({ className, theme, bindShortcut = false }: Props) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await runManualRefresh();
      toast.success('Data diperbarui');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui data');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!bindShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const isF5 = e.key === 'F5';
      const isCtrlR = (e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R');
      if (!isF5 && !isCtrlR) return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      void refresh();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bindShortcut, refresh]);

  const tone =
    theme === 'dark'
      ? 'text-slate-300 hover:bg-slate-700'
      : theme === 'light'
        ? 'text-slate-600 hover:bg-slate-200/80'
        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';

  return (
    <HeaderIconButton
      onClick={() => void refresh()}
      aria-label="Perbarui data"
      className={cn(tone, 'rounded-full', className)}
    >
      <RefreshCw className={cn('w-5 h-5', busy && 'animate-spin')} />
    </HeaderIconButton>
  );
}
