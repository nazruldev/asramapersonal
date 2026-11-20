import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  FileDown,
  Users,
  BarChart3,
  AlertTriangle,
  Share2,
  ChevronRight,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { HeaderNeutralButton } from '@/components/header-action-button';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { appFieldCompactClass } from '@/lib/form-styles';
import { useAppStore, type EntityRow } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { formatIzinBatasKembali } from '@/lib/izin-group';
import { fetchAbsensiForLaporanPeriod } from '@/lib/absensi-api';
import {
  fetchIzinForLaporanPeriod,
  fetchPembinaanForLaporanPeriod,
} from '@/lib/laporan-data-api';
import { toast } from '@/lib/toast';
import {
  computeLaporanSummary,
  periodLabel,
  type LaporanCustomRange,
  type LaporanPeriod,
  type LaporanWilayahGeo,
} from '@/lib/laporan-reports';
import type { KegiatanSchedule } from '@/lib/kegiatan-schedule';
import { UNDUH_BANTUAN_BULLET } from '@/lib/file-download-hints';
import {
  downloadLaporanPerSantri,
  downloadLaporanSemuaPerSantri,
  shareAllLaporan,
} from '@/lib/laporan-print';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { loadWilayahIndex } from '@/lib/wilayah-index';

const PRESET_PERIODS: Exclude<LaporanPeriod, 'custom'>[] = ['today', '7d', '30d', 'month'];

const PAKET_LAPORAN_RINGKAS =
  'Paket laporan: ringkasan harian, pelanggaran/pembinaan, kelas, plus laporan per santri.';

export default function Laporan() {
  const location = useLocation();
  const isLaporanScreen = location.pathname === '/laporan';
  const navigate = useNavigate();
  const dashboardReady = useReloadKeyReady('dashboard');
  const santriReady = useReloadKeyReady('santri');
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const settings = useAppStore((s) => s.settings);
  const stats = useAppStore((s) => s.dashboard);
  const santri = useAppStore((s) => s.santri);
  const kamar = useAppStore((s) => s.kamar);
  const kegiatanMaster = useAppStore((s) => s.kegiatan) as KegiatanSchedule[];
  const [period, setPeriod] = useState<LaporanPeriod>('today');
  const [customRange, setCustomRange] = useState<LaporanCustomRange | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftPeriod, setDraftPeriod] = useState<LaporanPeriod>('today');
  const [draftCustomDari, setDraftCustomDari] = useState(todayKey);
  const [draftCustomSampai, setDraftCustomSampai] = useState(todayKey);
  const [periodAbsensi, setPeriodAbsensi] = useState<EntityRow[]>([]);
  const [periodIzin, setPeriodIzin] = useState<EntityRow[]>([]);
  const [periodPembinaan, setPeriodPembinaan] = useState<EntityRow[]>([]);
  const [sharingAll, setSharingAll] = useState(false);
  const [downloadingSantri, setDownloadingSantri] = useState(false);
  const [santriPickOpen, setSantriPickOpen] = useState(false);
  const [santriQuery, setSantriQuery] = useState('');
  const [wilayahProvinsiGeo, setWilayahProvinsiGeo] = useState<LaporanWilayahGeo[]>([]);

  const loading = !dashboardReady || !santriReady;

  const refetchPeriodData = useCallback(async () => {
    const [abs, iz, pb] = await Promise.all([
      fetchAbsensiForLaporanPeriod(period, customRange),
      fetchIzinForLaporanPeriod(period, customRange),
      fetchPembinaanForLaporanPeriod(period, customRange),
    ]);
    setPeriodAbsensi(abs as EntityRow[]);
    setPeriodIzin(iz as EntityRow[]);
    setPeriodPembinaan(pb as EntityRow[]);
  }, [period, customRange]);

  const extraLaporanRefresh = useCallback(async () => {
    try {
      await refetchPeriodData();
      const idx = await loadWilayahIndex();
      setWilayahProvinsiGeo(
        idx.provinces.map((p) => ({ code: p.code, name: p.name, lat: p.lat, lng: p.lng }))
      );
    } catch {
      toast.error('Gagal memuat data laporan');
    }
  }, [refetchPeriodData]);

  useEffect(() => {
    void loadWilayahIndex().then((idx) =>
      setWilayahProvinsiGeo(
        idx.provinces.map((p) => ({ code: p.code, name: p.name, lat: p.lat, lng: p.lng }))
      )
    );
  }, []);

  useEffect(() => {
    if (loading) return;
    void refetchPeriodData().catch(() => toast.error('Gagal memuat data laporan'));
  }, [period, customRange, loading, refetchPeriodData]);

  const rekapLabel = useMemo(() => periodLabel(period, customRange), [period, customRange]);

  const hasActiveRekapFilter = period !== 'today';

  const openRekapFilter = useCallback(() => {
    setDraftPeriod(period);
    if (period === 'custom' && customRange) {
      setDraftCustomDari(customRange.dari);
      setDraftCustomSampai(customRange.sampai);
    } else {
      setDraftCustomDari(todayKey);
      setDraftCustomSampai(todayKey);
    }
    setFilterOpen(true);
  }, [period, customRange, todayKey]);

  const applyRekapFilter = () => {
    if (draftPeriod === 'custom') {
      const dari = draftCustomDari.slice(0, 10);
      const sampai = draftCustomSampai.slice(0, 10);
      if (!dari || !sampai || dari > sampai) {
        toast.error('Rentang tanggal tidak valid');
        return;
      }
      setPeriod('custom');
      setCustomRange({ dari, sampai });
    } else {
      setPeriod(draftPeriod);
      setCustomRange(undefined);
    }
    setFilterOpen(false);
  };

  const resetRekapFilter = () => {
    setPeriod('today');
    setCustomRange(undefined);
    setDraftPeriod('today');
    setDraftCustomDari(todayKey);
    setDraftCustomSampai(todayKey);
    setFilterOpen(false);
  };

  const headerFilterAction = useMemo(
    () => (
      <HeaderNeutralButton
        onClick={openRekapFilter}
        label="Filter periode rekap"
        className="relative"
      >
        <SlidersHorizontal className="w-5 h-5" />
        {hasActiveRekapFilter ? (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-white dark:ring-slate-900" />
        ) : null}
      </HeaderNeutralButton>
    ),
    [hasActiveRekapFilter, openRekapFilter]
  );

  useScreenHeaderActions(isLaporanScreen ? headerFilterAction : null, [
    isLaporanScreen,
    headerFilterAction,
  ]);

  const ctx = useMemo(
    () => ({
      namaAsrama: settings.namaAsrama,
      period,
      customRange,
      stats,
      santri,
      kamar,
      absensi: periodAbsensi,
      izin: periodIzin,
      pembinaan: periodPembinaan,
      kegiatan: kegiatanMaster,
      wilayahProvinsiGeo,
    }),
    [
      settings,
      period,
      customRange,
      stats,
      santri,
      kamar,
      periodAbsensi,
      periodIzin,
      periodPembinaan,
      kegiatanMaster,
      wilayahProvinsiGeo,
    ]
  );

  const summary = useMemo(() => computeLaporanSummary(ctx), [ctx]);

  const todayLabel = format(new Date(), 'EEEE, d MMMM yyyy', { locale: localeId });

  const handleShareAll = useCallback(async () => {
    setSharingAll(true);
    try {
      await shareAllLaporan(ctx);
    } catch {
      toast.error('Gagal membagikan laporan');
    } finally {
      setSharingAll(false);
    }
  }, [ctx]);

  const filteredSantriPick = useMemo(() => {
    const q = santriQuery.trim().toLowerCase();
    const list = [...santri].sort((a, b) =>
      String(a.nama ?? '').localeCompare(String(b.nama ?? ''), 'id')
    );
    if (!q) return list;
    return list.filter((s) => {
      const nama = String(s.nama ?? '').toLowerCase();
      const kamar = String(s.kamar ?? '').toLowerCase();
      const kelas = String(s.kelas ?? '').toLowerCase();
      return nama.includes(q) || kamar.includes(q) || kelas.includes(q);
    });
  }, [santri, santriQuery]);

  const handleDownloadSemuaPerSantri = useCallback(async () => {
    setDownloadingSantri(true);
    try {
      await downloadLaporanSemuaPerSantri(ctx);
    } catch {
      toast.error('Gagal mengunduh laporan per santri');
    } finally {
      setDownloadingSantri(false);
    }
  }, [ctx]);

  const handleDownloadSatuSantri = useCallback(
    async (santriId: string) => {
      setDownloadingSantri(true);
      try {
        await downloadLaporanPerSantri(ctx, santriId);
        setSantriPickOpen(false);
      } catch {
        toast.error('Gagal mengunduh laporan santri');
      } finally {
        setDownloadingSantri(false);
      }
    },
    [ctx]
  );

  const statCards = [
    { label: 'Di asrama', value: summary.diAsrama, sub: `dari ${summary.totalSantri} santri`, tone: 'text-emerald-700' },
    { label: 'Sedang izin', value: summary.activeIzinCount, sub: 'belum kembali', tone: 'text-amber-700' },
    {
      label: 'Catatan absensi',
      value: summary.absensiPeriodCount,
      sub: rekapLabel,
      tone: 'text-slate-800',
    },
    {
      label: 'Pelanggaran/Pembinaan',
      value: summary.bkPeriodCount,
      sub: rekapLabel,
      tone: 'text-blue-700',
    },
  ];

  return (
    <PageWithPullRefresh
      keys={['dashboard', 'santri', 'kamar', 'kegiatan', 'settings']}
      extraRefresh={extraLaporanRefresh}
      className="space-y-5 pb-2"
    >
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-900 text-white rounded-sm p-5 shadow-lg border border-emerald-800/30 relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-300/90">
            <BarChart3 className="w-3.5 h-3.5" />
            Pusat Laporan Asrama
          </div>
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">{settings.namaAsrama}</h2>
            <p className="text-xs text-emerald-100/75 mt-1">{todayLabel}</p>
            <p className="text-[11px] text-emerald-200/90 mt-1.5 font-semibold">Rekap: {rekapLabel}</p>
          </div>
          <p className="text-[11px] text-emerald-50/80 leading-relaxed max-w-prose">
            {PAKET_LAPORAN_RINGKAS} Gunakan filter periode (ikon di atas) sebelum kirim atau unduh.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              disabled={sharingAll || loading}
              onClick={() => void handleShareAll()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-sm bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold active:scale-[0.98] disabled:opacity-60"
            >
              <Share2 className="w-4 h-4" />
              {sharingAll ? 'Menyiapkan...' : 'Kirim semua laporan'}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={loading || downloadingSantri || santri.length === 0}
              onClick={() => {
                setSantriQuery('');
                setSantriPickOpen(true);
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-sm bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold active:scale-[0.98] disabled:opacity-60"
            >
              <UserRound className="w-4 h-4" />
              Unduh 1 santri
            </button>
            <button
              type="button"
              disabled={loading || downloadingSantri || santri.length === 0}
              onClick={() => void handleDownloadSemuaPerSantri()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-sm bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold active:scale-[0.98] disabled:opacity-60"
            >
              <Users className="w-4 h-4" />
              {downloadingSantri ? 'Menyiapkan...' : 'Unduh semua per santri'}
            </button>
          </div>
        </div>
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl" />
      </div>

      <details className={cn(appCardClass, 'p-3 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed')}>
        <summary className="font-bold text-slate-800 dark:text-slate-100 cursor-pointer select-none">
          File unduhan disimpan di mana?
        </summary>
        <ul className="mt-2.5 space-y-2 list-disc pl-4 marker:text-emerald-600">
          <li>{UNDUH_BANTUAN_BULLET.laporanHtml}</li>
          <li>{UNDUH_BANTUAN_BULLET.hp}</li>
          <li>{UNDUH_BANTUAN_BULLET.pc}</li>
        </ul>
      </details>

      <AppModal
        open={santriPickOpen}
        onClose={() => setSantriPickOpen(false)}
        title="Pilih santri untuk unduh"
      >
        <div className="space-y-3">
          <input
            type="search"
            value={santriQuery}
            onChange={(e) => setSantriQuery(e.target.value)}
            placeholder="Cari nama / kelas / kamar…"
            className={`${appFieldCompactClass} w-full`}
          />
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {filteredSantriPick.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Tidak ada santri cocok.</p>
            ) : (
              filteredSantriPick.map((s) => (
                <button
                  key={String(s.id)}
                  type="button"
                  disabled={downloadingSantri}
                  onClick={() => void handleDownloadSatuSantri(String(s.id))}
                  className={cn(
                    appCardClass,
                    'w-full p-3 text-left flex items-center gap-3 hover:border-emerald-400 disabled:opacity-60'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                      {String(s.nama ?? 'Santri')}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {String(s.kelas ?? '—')} · Kamar {String(s.kamar ?? '—')}
                    </p>
                  </div>
                  <FileDown className="w-4 h-4 text-emerald-700 shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>
      </AppModal>

      <AppModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Periode rekap">
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Periode cepat</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_PERIODS.map((p) => {
                const active = draftPeriod === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDraftPeriod(p)}
                    className={`px-3 py-1.5 rounded-sm text-xs font-bold transition-all ${
                      active
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700'
                    }`}
                  >
                    {periodLabel(p)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Rentang kustom</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-500">Dari</label>
                <input
                  type="date"
                  value={draftCustomDari}
                  max={draftCustomSampai || todayKey}
                  onChange={(e) => {
                    setDraftPeriod('custom');
                    setDraftCustomDari(e.target.value);
                  }}
                  className={`${appFieldCompactClass} w-full`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-slate-500">Sampai</label>
                <input
                  type="date"
                  value={draftCustomSampai}
                  min={draftCustomDari}
                  max={todayKey}
                  onChange={(e) => {
                    setDraftPeriod('custom');
                    setDraftCustomSampai(e.target.value);
                  }}
                  className={`${appFieldCompactClass} w-full`}
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-snug">
              Rekap pelanggaran/pembinaan mengikuti periode yang dipilih.
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 text-xs" onClick={resetRekapFilter}>
              Reset filter
            </Button>
            <Button type="button" className="flex-1 text-xs" onClick={applyRekapFilter}>
              Terapkan
            </Button>
          </div>
        </div>
      </AppModal>

      {/* Stat grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {statCards.map((c) => (
          <div
            key={c.label}
            className={cn(appCardClass, 'p-3')}
          >
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{c.label}</p>
            <p className={`text-2xl font-extrabold mt-0.5 tabular-nums ${c.tone}`}>
              {loading ? '—' : c.value}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {summary.overdueIzin.length > 0 && (
        <div className="rounded-sm border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <p className="text-xs font-bold">Izin lewat batas ({summary.overdueIzin.length})</p>
          </div>
          <ul className="space-y-1.5">
            {summary.overdueIzin.slice(0, 5).map((i, idx) => (
              <li key={idx} className="text-[11px] text-rose-900/90 leading-snug">
                <span className="font-semibold">{String(i.santri_nama)}</span> — batas{' '}
                {formatIzinBatasKembali(String(i.batas_kembali))}
              </li>
            ))}
          </ul>
          {summary.overdueIzin.length > 5 && (
            <button
              type="button"
              onClick={() => navigate('/laporan/izin')}
              className="text-[11px] font-bold text-rose-700"
            >
              Lihat semua di Izin →
            </button>
          )}
        </div>
      )}

      {Object.keys(summary.bkByJenis).length > 0 && (
        <div className={cn(appCardClass, 'p-3')}>
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-2">Pelanggaran/Pembinaan ({rekapLabel})</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(summary.bkByJenis).map(([j, n]) => (
              <span
                key={j}
                className="text-[10px] font-semibold px-2 py-1 rounded-sm bg-slate-100 text-slate-700"
              >
                {j}: {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Santri ringkas */}
      <section className="space-y-2">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide px-0.5">Data terkait</p>
        <button
          type="button"
          onClick={() => navigate('/master/santri')}
          className={cn(
            appCardClass,
            'w-full p-4 hover:border-emerald-400 dark:hover:border-emerald-600 transition-all flex items-center gap-4 text-left active:scale-[0.99]'
          )}
        >
          <div className="w-11 h-11 rounded-sm bg-blue-600 text-white flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Data Santri</h3>
            <p className="text-[11px] text-slate-500">{santri.length} santri terdaftar</p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </section>
    </PageWithPullRefresh>
  );
}
