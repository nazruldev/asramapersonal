import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin, Trophy } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { WilayahSebaranMap } from '@/components/wilayah-sebaran-map';
import { appCardClass, appTabActiveClass, appTabIdleClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { loadWilayahIndex } from '@/lib/wilayah-index';
import {
  aggregateSantriByKecamatan,
  aggregateSantriByKota,
  aggregateSantriByProvinsi,
  type WilayahAggRow,
} from '@/lib/wilayah-stats';
import type { SantriAsalWilayahFields } from '@/lib/wilayah-types';
import { hasAsalWilayah } from '@/lib/wilayah-types';

type Tab = 'provinsi' | 'kota' | 'kecamatan';

function rankBadgeClass(rank: number) {
  if (rank === 1) return 'bg-amber-400 text-amber-950';
  if (rank === 2) return 'bg-slate-300 text-slate-800 dark:bg-slate-500 dark:text-white';
  if (rank === 3) return 'bg-amber-700/80 text-white';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200';
}

export default function WilayahSebaran() {
  const santriReady = useReloadKeyReady('santri');
  const santriList = useAppStore((s) => s.santri) as SantriAsalWilayahFields[];
  const [tab, setTab] = useState<Tab>('provinsi');
  const [provinces, setProvinces] = useState<{ code: string; name: string; lat: number; lng: number }[]>(
    []
  );

  const refreshWilayahIndex = useCallback(async () => {
    const idx = await loadWilayahIndex();
    setProvinces(idx.provinces);
  }, []);

  useEffect(() => {
    void refreshWilayahIndex();
  }, [refreshWilayahIndex]);

  const withAsal = useMemo(() => santriList.filter((s) => hasAsalWilayah(s)), [santriList]);

  const rankedProvinsi = useMemo(
    () => aggregateSantriByProvinsi(santriList, provinces),
    [santriList, provinces]
  );

  const rankedKota = useMemo(() => aggregateSantriByKota(santriList), [santriList]);

  const rankedKecamatan = useMemo(() => aggregateSantriByKecamatan(santriList), [santriList]);

  const ranked: WilayahAggRow[] =
    tab === 'provinsi' ? rankedProvinsi : tab === 'kota' ? rankedKota : rankedKecamatan;

  return (
    <PageWithPullRefresh
      keys={['santri']}
      extraRefresh={refreshWilayahIndex}
      className="space-y-3"
    >
      <div className={cn(appCardClass, 'p-3.5 flex gap-3 items-start')}>
        <div className="w-10 h-10 rounded-sm bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 flex items-center justify-center shrink-0">
          <MapPin className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-50">Sebaran Asal Santri</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            {withAsal.length} dari {santriList.length} santri sudah punya data asal wilayah. Peringkat
            menunjukkan wilayah dengan santri terbanyak.
          </p>
        </div>
      </div>

      <WilayahSebaranMap rows={rankedProvinsi} />

      <div className="flex gap-1.5 p-0.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-sm border border-slate-200/60 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setTab('provinsi')}
          className={cn('flex-1 py-2 text-[10px] font-bold rounded-sm', tab === 'provinsi' ? appTabActiveClass : appTabIdleClass)}
        >
          Provinsi
        </button>
        <button
          type="button"
          onClick={() => setTab('kota')}
          className={cn('flex-1 py-2 text-[10px] font-bold rounded-sm', tab === 'kota' ? appTabActiveClass : appTabIdleClass)}
        >
          Kota/Kab.
        </button>
        <button
          type="button"
          onClick={() => setTab('kecamatan')}
          className={cn(
            'flex-1 py-2 text-[10px] font-bold rounded-sm',
            tab === 'kecamatan' ? appTabActiveClass : appTabIdleClass
          )}
        >
          Kecamatan
        </button>
      </div>

      {tab === 'kecamatan' && rankedKecamatan.length > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
          {rankedKecamatan.length} kecamatan punya santri di asrama (total{' '}
          {rankedKecamatan.reduce((n, r) => n + r.count, 0)} santri dengan data kecamatan).
        </p>
      )}

      {!santriReady ? (
        <ListSkeleton rows={8} />
      ) : ranked.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Belum ada data sebaran"
          description="Tambahkan asal wilayah pada data santri di menu Master → Data Santri."
        />
      ) : (
        <ul className="space-y-2">
          {ranked.map((row, idx) => {
            const rank = idx + 1;
            return (
              <li
                key={`${tab}-${row.code}`}
                className={cn(appCardClass, 'flex items-center gap-3 px-3 py-2.5')}
              >
                <span
                  className={cn(
                    'w-8 h-8 rounded-sm flex items-center justify-center text-xs font-extrabold shrink-0',
                    rankBadgeClass(rank)
                  )}
                >
                  {rank}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
                    {row.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {row.count} santri
                    {tab === 'provinsi' && rankedProvinsi[0]?.code === row.code
                      ? ' · terbanyak'
                      : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageWithPullRefresh>
  );
}
