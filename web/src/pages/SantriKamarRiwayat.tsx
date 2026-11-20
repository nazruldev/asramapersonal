import { useCallback, useEffect, useState } from 'react';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useLocation, useNavigate } from 'react-router';
import { ArrowRightLeft, BedDouble, ChevronRight, CircleAlert, Crown, History, Users } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { withBackTo } from '@/lib/app-navigation';
import {
  formatRiwayatKamarTanggal,
  labelRiwayatKamarTipe,
  parseSantriIdFromKamarRiwayatPath,
  type SantriKamarRiwayatApiResponse,
  type SantriKamarRiwayatTipe,
} from '@/lib/santri-kamar-riwayat';
import { appCardClass, appListCardButtonClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';

function tipeBadgeClass(tipe: SantriKamarRiwayatTipe): string {
  switch (tipe) {
    case 'ketua':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'pindah':
      return 'bg-violet-50 text-violet-800 border-violet-200';
    case 'keluar':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'masuk':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export default function SantriKamarRiwayat() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const santriId = parseSantriIdFromKamarRiwayatPath(pathname);
  const [data, setData] = useState<SantriKamarRiwayatApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRiwayat = useCallback(async () => {
    if (!santriId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/santri/${encodeURIComponent(santriId)}/riwayat-kamar`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Gagal memuat riwayat kamar');
      }
      const json = (await res.json()) as SantriKamarRiwayatApiResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat kamar');
    } finally {
      setLoading(false);
    }
  }, [santriId]);

  useEffect(() => {
    void loadRiwayat();
  }, [loadRiwayat]);

  if (!santriId) {
    return <EmptyState icon={CircleAlert} title="Halaman tidak valid" variant="inline" />;
  }

  const { santri, summary, timeline, currentKamar } = data ?? {
    santri: { id: santriId, nama: '…', kelas: '-' },
    summary: { pindahKamar: 0, sebagaiKetua: 0, sebagaiAnggota: 0 },
    timeline: [],
    currentKamar: null,
  };

  return (
    <PageWithPullRefresh
      keys={['santri', 'kamar']}
      extraRefresh={loadRiwayat}
      className="space-y-4"
    >
      <div className={cn(appCardClass, 'p-4 space-y-2')}>
        <h2 className="text-base font-bold text-slate-900 leading-snug">{santri.nama}</h2>
        <p className="text-[11px] text-slate-500">Kelas {santri.kelas}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={cn(appCardClass, 'p-3 text-center')}>
          <ArrowRightLeft className="w-4 h-4 mx-auto text-violet-600 mb-1" />
          <p className="text-lg font-bold text-slate-900">{summary.pindahKamar}</p>
          <p className="text-[10px] text-slate-500 leading-tight">Pindah kamar</p>
        </div>
        <div className={cn(appCardClass, 'p-3 text-center')}>
          <Crown className="w-4 h-4 mx-auto text-amber-600 mb-1" />
          <p className="text-lg font-bold text-slate-900">{summary.sebagaiKetua}</p>
          <p className="text-[10px] text-slate-500 leading-tight">Sebagai ketua</p>
        </div>
        <div className={cn(appCardClass, 'p-3 text-center')}>
          <Users className="w-4 h-4 mx-auto text-emerald-600 mb-1" />
          <p className="text-lg font-bold text-slate-900">{summary.sebagaiAnggota}</p>
          <p className="text-[10px] text-slate-500 leading-tight">Sebagai anggota</p>
        </div>
      </div>

      {currentKamar ? (
        <button
          type="button"
          onClick={() =>
            navigate(currentKamar.detailPath, withBackTo(`/master/santri/${encodeURIComponent(santriId)}/kamar`))
          }
          className={cn(appListCardButtonClass, 'active:opacity-90')}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 min-w-0">
              <BedDouble className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kamar sekarang</p>
                <p className="text-sm font-bold text-slate-900 truncate">{currentKamar.nama}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {currentKamar.terisi}/{currentKamar.kapasitas} penghuni · {currentKamar.lamaDiKamar}
                </p>
                {currentKamar.isKetua ? (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    <Crown className="w-3 h-3" />
                    Ketua kamar
                  </span>
                ) : currentKamar.ketuaNama ? (
                  <p className="text-[11px] text-slate-500 mt-1">Ketua: {currentKamar.ketuaNama}</p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">Belum ada ketua</p>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 mt-2" />
          </div>
        </button>
      ) : (
        <EmptyState
          icon={BedDouble}
          title="Belum punya kamar"
          description="Penempatan lewat menu Data Kamar."
        />
      )}

      <div>
        <h3 className="text-xs font-bold text-slate-700 mb-2 px-0.5">Riwayat penempatan</h3>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <p className="text-xs text-rose-600 text-center py-6">{error}</p>
        ) : timeline.length === 0 ? (
          <EmptyState
            icon={History}
            title="Belum ada riwayat"
            description="Perpindahan dan jabatan ketua akan tercatat otomatis."
            variant="inline"
          />
        ) : (
          <ul className="space-y-2">
            {timeline.map((row) => (
              <li
                key={row.id}
                className={cn(appCardClass, 'p-3 flex flex-col gap-1')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tipeBadgeClass(row.tipe)}`}
                  >
                    {labelRiwayatKamarTipe(row.tipe)}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatRiwayatKamarTanggal(row.tanggal)}</span>
                </div>
                <p className="text-sm font-medium text-slate-800">
                  {row.tipe === 'keluar' ? row.kamar_nama : row.kamar_nama}
                  {row.kamar_sebelumnya && row.tipe === 'pindah' ? (
                    <span className="text-slate-500 font-normal"> · dari {row.kamar_sebelumnya}</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageWithPullRefresh>
  );
}
