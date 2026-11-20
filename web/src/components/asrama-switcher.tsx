import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { AppModal } from '@/components/ui/app-modal';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import type { Asrama } from '@/lib/app-settings';
import {
  getSessionUser,
  setActiveAsramaId,
  subscribeSessionUser,
} from '@/lib/app-auth';

type AsramaSwitcherProps = {
  className?: string;
  /** `icon` = tombol ikon di header (sebelah dark mode). */
  variant?: 'default' | 'icon';
  theme?: 'light' | 'dark';
};

/**
 * Tombol ganti asrama — hanya tampil jika akun bisa memilih >1 asrama
 * (super admin / bendahara multi-asrama / bendahara semua asrama).
 */
export function AsramaSwitcher({
  className,
  variant = 'default',
  theme = 'light',
}: AsramaSwitcherProps) {
  const reloadAll = useAppStore((s) => s.reloadAll);
  const [sessionUser, setSessionUserState] = useState(() => getSessionUser());
  const [asramaList, setAsramaList] = useState<Asrama[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeSessionUser(() => setSessionUserState(getSessionUser())), []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/asrama')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setAsramaList(data as Asrama[]);
      })
      .catch(() => {
        if (!cancelled) setAsramaList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dibatasiTugas =
    sessionUser && sessionUser.role !== 'super_admin' && sessionUser.asramaIds.length > 0;
  const options = dibatasiTugas
    ? (asramaList ?? []).filter((a) => sessionUser.asramaIds.includes(a.id))
    : (asramaList ?? []);
  const bisaPilihSemua = !sessionUser || sessionUser.role !== 'pengawas';
  const activeId = sessionUser?.activeAsramaId ?? null;

  // Muncul hanya jika benar-benar ada pilihan ganda.
  if (options.length < 2) return null;

  const activeName = activeId
    ? (options.find((a) => a.id === activeId)?.nama ?? 'Asrama')
    : 'Semua asrama';

  const pilih = (id: string | null) => {
    setActiveAsramaId(id);
    setOpen(false);
    void reloadAll();
  };

  const trigger =
    variant === 'icon' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'p-2.5 rounded-full shrink-0 active:scale-95 transition-all',
          theme === 'dark'
            ? 'text-slate-300 hover:bg-slate-700'
            : 'text-slate-600 hover:bg-slate-200/80',
          className
        )}
        title={`Ganti asrama (${activeName})`}
        aria-label={`Ganti asrama: ${activeName}`}
      >
        <Building2 className="w-5 h-5" />
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[11px] font-bold',
          'bg-black/25 border border-white/30 text-white backdrop-blur-sm',
          'active:scale-95 transition-all',
          className
        )}
      >
        <Building2 className="w-3.5 h-3.5" />
        <span className="max-w-[10rem] truncate">{activeName}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-80" />
      </button>
    );

  return (
    <>
      {trigger}

      <AppModal open={open} onClose={() => setOpen(false)} title="Pilih Asrama">
        <div className="space-y-1">
          {bisaPilihSemua && (
            <button
              type="button"
              onClick={() => pilih(null)}
              className={cn(
                'w-full flex items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                activeId === null
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
              )}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="flex-1">Semua asrama</span>
              {activeId === null && <Check className="w-4 h-4 text-emerald-600" />}
            </button>
          )}
          {options.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => pilih(a.id)}
              className={cn(
                'w-full flex items-center gap-2 rounded-sm px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                activeId === a.id
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
              )}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="flex-1">{a.nama}</span>
              {activeId === a.id && <Check className="w-4 h-4 text-emerald-600" />}
            </button>
          ))}
        </div>
      </AppModal>
    </>
  );
}
