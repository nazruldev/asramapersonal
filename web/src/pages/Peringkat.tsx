import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ClockAlert, ShieldAlert, Trophy } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { appCardClass, appTabActiveClass, appTabIdleClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import {
  buildPeringkatForKind,
  PERINGKAT_TABS,
  type PeringkatKind,
} from '@/lib/santri-peringkat';
import type { PembinaanRow } from '@/lib/pembinaan-group';
import { pembinaanDetailPath } from '@/lib/pembinaan-group';
import { izinDetailPath } from '@/lib/izin-group';
import { withBackTo } from '@/lib/app-navigation';

const TAB_ICONS = {
  izin: ClockAlert,
  pelanggaran: ShieldAlert,
} as const;

function rankBadgeClass(rank: number) {
  if (rank === 1) return 'bg-amber-400 text-amber-950';
  if (rank === 2) return 'bg-slate-300 text-slate-800 dark:bg-slate-500 dark:text-white';
  if (rank === 3) return 'bg-amber-700/80 text-white';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200';
}

export default function Peringkat() {
  const navigate = useNavigate();
  const dataReady = useReloadKeyReady('santri');
  const settings = useAppStore((s) => s.settings);
  const santriList = useAppStore((s) => s.santri);
  const izinList = useAppStore((s) => s.izin);
  const pembinaanList = useAppStore((s) => s.pembinaan) as PembinaanRow[];

  const [tab, setTab] = useState<PeringkatKind>('izin');

  const tabMeta = PERINGKAT_TABS.find((t) => t.id === tab)!;

  const ranked = useMemo(
    () =>
      buildPeringkatForKind(tab, {
        santri: santriList as { id: string; nama?: string; kelas?: string; kamar?: string; jumlah_pelanggaran?: number }[],
        izin: izinList,
        pembinaan: pembinaanList,
        settings,
      }),
    [tab, santriList, izinList, pembinaanList, settings]
  );

  const openDetail = (santriId: string) => {
    if (tab === 'izin') {
      navigate(izinDetailPath(santriId), withBackTo('/laporan/peringkat'));
      return;
    }
    navigate(pembinaanDetailPath(santriId), withBackTo('/laporan/peringkat'));
  };

  return (
    <PageWithPullRefresh
      keys={['santri', 'izin', 'pembinaan', 'settings']}
      className="space-y-3"
    >
      <div className={cn(appCardClass, 'p-3.5 flex gap-3 items-start')}>
        <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-50">Daftar Peringkat Santri</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            Pantau santri yang sering izin atau pelanggaran. Ketuk nama untuk lihat riwayat lengkap.
          </p>
        </div>
      </div>

      <div className="flex gap-1.5 p-0.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-sm border border-slate-200/60 dark:border-slate-700">
        {PERINGKAT_TABS.map((t) => {
          const Icon = TAB_ICONS[t.id];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-sm text-[10px] font-bold transition-all active:scale-[0.98]',
                active ? appTabActiveClass : appTabIdleClass
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5">{tabMeta.hint}</p>

      {!dataReady ? (
        <ListSkeleton rows={8} />
      ) : ranked.length === 0 ? (
        <EmptyState
          icon={TAB_ICONS[tab]}
          title="Belum ada data untuk peringkat ini"
          description="Data akan muncul setelah ada catatan izin atau pelanggaran yang relevan."
          variant="inline"
        />
      ) : (
        <div className="space-y-1.5">
          {ranked.map((row, index) => {
            const rank = index + 1;
            return (
              <button
                key={row.santriId}
                type="button"
                onClick={() => openDetail(row.santriId)}
                className={cn(
                  appCardClass,
                  'w-full p-3 flex items-center gap-3 text-left active:scale-[0.99] transition-transform hover:border-emerald-300/80 dark:hover:border-emerald-700'
                )}
              >
                <span
                  className={cn(
                    'w-8 h-8 rounded-sm flex items-center justify-center text-xs font-black shrink-0 tabular-nums',
                    rankBadgeClass(rank)
                  )}
                >
                  {rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-50 truncate">{row.nama}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {row.kelas} · {row.kamar}
                    {row.sublabel ? ` · ${row.sublabel}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-black tabular-nums text-slate-900 dark:text-slate-50 leading-none">
                    {row.count}
                  </p>
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                    {tabMeta.countLabel}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </PageWithPullRefresh>
  );
}
