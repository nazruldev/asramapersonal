import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  FileDown,
  Users,
  AlertTriangle,
  Share2,
  ChevronRight,
  SlidersHorizontal,
  UserRound,
  ClipboardList,
  CalendarCheck,
  ClockAlert,
  ShieldAlert,
  Trophy,
  BedDouble,
  GraduationCap,
  MapPin,
} from 'lucide-react';
import { AppModal, AppModalFooter } from '@/components/ui/app-modal';
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
  type LaporanReportId,
  type LaporanWilayahGeo,
} from '@/lib/laporan-reports';
import type { KegiatanSchedule } from '@/lib/kegiatan-schedule';
import { UNDUH_BANTUAN_BULLET } from '@/lib/file-download-hints';
import {
  downloadLaporanBundle,
  downloadLaporanPerSantri,
  downloadLaporanSemuaPerSantri,
  downloadSingleLaporanPdf,
  shareAllLaporan,
  shareLaporanBundle,
  shareLaporanPerSantri,
  shareLaporanSemuaPerSantri,
  shareSingleLaporanPdf,
} from '@/lib/laporan-print';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { loadWilayahIndex } from '@/lib/wilayah-index';

const PRESET_PERIODS: Exclude<LaporanPeriod, 'custom'>[] = ['today', '7d', '30d', 'month'];

const reportCardClass = cn(
  appCardClass,
  'w-full p-4 text-left flex items-center gap-3 hover:border-emerald-400 dark:hover:border-emerald-600 active:scale-[0.99] transition-all disabled:opacity-60'
);

type ReportScope = 'lengkap' | 'persantri' | LaporanReportId;

const SINGLE_REPORTS: { id: LaporanReportId; title: string; desc: string; icon: typeof FileDown; tone: string; perSantri?: boolean }[] = [
  { id: 'absensi', title: 'Rekap Absensi', desc: 'Ringkasan kehadiran santri pada periode terpilih.', icon: CalendarCheck, tone: 'text-emerald-600', perSantri: true },
  { id: 'izin', title: 'Rekap Perizinan', desc: 'Daftar izin keluar, kembali, dan yang melewati batas.', icon: ClockAlert, tone: 'text-emerald-600', perSantri: true },
  { id: 'pembinaan', title: 'Rekap Pembinaan', desc: 'Catatan pembinaan per jenis pada periode terpilih.', icon: ShieldAlert, tone: 'text-emerald-600', perSantri: true },
  { id: 'pelanggaran', title: 'Peringkat Pelanggaran', desc: 'Santri dengan poin pelanggaran terbanyak.', icon: Trophy, tone: 'text-emerald-600' },
  { id: 'kamar', title: 'Rekap Hunian Kamar', desc: 'Okupansi dan penghuni tiap kamar.', icon: BedDouble, tone: 'text-emerald-600' },
  { id: 'kelas', title: 'Rekap Santri per Kelas', desc: 'Jumlah dan daftar santri per kelas.', icon: GraduationCap, tone: 'text-emerald-600' },
  { id: 'wilayah', title: 'Sebaran Asal Wilayah', desc: 'Distribusi santri berdasarkan wilayah asal.', icon: MapPin, tone: 'text-emerald-600' },
];

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
  const [santriPickOpen, setSantriPickOpen] = useState(false);
  const [scopePickOpen, setScopePickOpen] = useState<ReportScope | null>(null);
  const [santriPickFor, setSantriPickFor] = useState<ReportScope>('persantri');
  const [actionPick, setActionPick] = useState<{ scope: ReportScope; santriId?: string } | null>(null);
  const [busyAction, setBusyAction] = useState<'unduh' | 'bagikan' | null>(null);
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
        className="relative text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/40"
      >
        <SlidersHorizontal className="w-5 h-5" />
        {hasActiveRekapFilter ? (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-extrabold leading-4 text-center ring-2 ring-white dark:ring-slate-900">
            1
          </span>
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

  const runReportAction = useCallback(
    async (action: 'unduh' | 'bagikan') => {
      if (!actionPick) return;
      const { scope, santriId } = actionPick;
      setBusyAction(action);
      try {
        if (scope === 'lengkap') {
          await (action === 'unduh' ? downloadLaporanBundle(ctx) : shareLaporanBundle(ctx));
        } else if (scope === 'persantri') {
          if (santriId) {
            await (action === 'unduh'
              ? downloadLaporanPerSantri(ctx, santriId)
              : shareLaporanPerSantri(ctx, santriId));
          } else {
            await (action === 'unduh'
              ? downloadLaporanSemuaPerSantri(ctx)
              : shareLaporanSemuaPerSantri(ctx));
          }
        } else {
          await (action === 'unduh'
            ? downloadSingleLaporanPdf(scope, ctx, santriId)
            : shareSingleLaporanPdf(scope, ctx, santriId));
        }
        setActionPick(null);
      } catch {
        toast.error(action === 'unduh' ? 'Gagal mengunduh laporan' : 'Gagal membagikan laporan');
      } finally {
        setBusyAction(null);
      }
    },
    [actionPick, ctx]
  );

  return (
    <PageWithPullRefresh
      keys={['dashboard', 'santri', 'kamar', 'kegiatan', 'settings']}
      extraRefresh={extraLaporanRefresh}
      className="space-y-5 pb-2"
    >
      {/* Info rekap aktif */}
      <button
        type="button"
        onClick={openRekapFilter}
        className={cn(
          appCardClass,
          'w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors'
        )}
      >
        <SlidersHorizontal className="w-4 h-4 text-emerald-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Periode laporan
          </p>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
            {rekapLabel} <span className="font-medium text-slate-400">· {todayLabel}</span>
          </p>
        </div>
        {hasActiveRekapFilter && (
          <span className="shrink-0 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">
            1 filter
          </span>
        )}
      </button>

      {/* Pilih tipe laporan — kartu 1 kolom ke bawah */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
          Pilih Jenis Laporan · v0.1.5
        </h3>
        <div className="space-y-2">
          <button
            type="button"
            disabled={loading || busyAction !== null}
            onClick={() => setScopePickOpen('lengkap')}
            className={reportCardClass}
          >
            <ClipboardList className="w-6 h-6 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Laporan Lengkap</p>
              <p className="text-[11px] text-slate-500 leading-snug">
                Semua bagian laporan dalam satu file (harian, pembinaan, kelas, pelanggaran).
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <button
            type="button"
            disabled={loading || busyAction !== null || santri.length === 0}
            onClick={() => setScopePickOpen('persantri')}
            className={reportCardClass}
          >
            <UserRound className="w-6 h-6 text-blue-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Laporan Santri</p>
              <p className="text-[11px] text-slate-500 leading-snug">
                Rekap per santri — untuk semua santri atau satu santri tertentu.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          {SINGLE_REPORTS.map((r) => {
            const RIcon = r.icon;
            return (
              <button
                key={r.id}
                type="button"
                disabled={loading || busyAction !== null}
                onClick={() => (r.perSantri ? setScopePickOpen(r.id) : setActionPick({ scope: r.id }))}
                className={reportCardClass}
              >
                <RIcon className={cn('w-6 h-6 shrink-0', r.tone)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{r.title}</p>
                  <p className="text-[11px] text-slate-500 leading-snug">{r.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            );
          })}

          <button
            type="button"
            disabled={sharingAll || loading}
            onClick={() => void handleShareAll()}
            className={reportCardClass}
          >
            <Share2 className="w-6 h-6 text-teal-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Kirim via WhatsApp</p>
              <p className="text-[11px] text-slate-500 leading-snug">
                Ringkasan harian + pembinaan — langsung dibagikan sebagai teks WA.
              </p>
            </div>
            {sharingAll ? (
              <span className="text-[10px] font-bold text-teal-700 shrink-0">Menyiapkan…</span>
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>
        </div>
      </section>

      {/* Modal pilih cakupan */}
      <AppModal
        open={scopePickOpen !== null}
        onClose={() => setScopePickOpen(null)}
        title={
          scopePickOpen === 'lengkap'
            ? 'Cakupan laporan lengkap'
            : scopePickOpen === 'persantri'
              ? 'Cakupan laporan santri'
              : `Cakupan ${SINGLE_REPORTS.find((r) => r.id === scopePickOpen)?.title ?? 'laporan'}`
        }
      >
        <div className="space-y-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              const scope = scopePickOpen;
              setScopePickOpen(null);
              if (scope) setActionPick({ scope });
            }}
            className={cn(
              appCardClass,
              'w-full p-3.5 text-left flex items-center gap-3 hover:border-emerald-400 disabled:opacity-60'
            )}
          >
            <Users className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Semua santri</p>
              <p className="text-[11px] text-slate-500">Satu file berisi laporan tiap santri.</p>
            </div>
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              if (scopePickOpen) setSantriPickFor(scopePickOpen);
              setScopePickOpen(null);
              setSantriQuery('');
              setSantriPickOpen(true);
            }}
            className={cn(
              appCardClass,
              'w-full p-3.5 text-left flex items-center gap-3 hover:border-emerald-400 disabled:opacity-60'
            )}
          >
            <UserRound className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Satu santri</p>
              <p className="text-[11px] text-slate-500">Pilih nama santri, lalu unduh laporannya.</p>
            </div>
          </button>
        </div>
      </AppModal>

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

      {/* Modal pilih aksi: unduh atau bagikan */}
      <AppModal
        open={actionPick !== null}
        onClose={() => setActionPick(null)}
        title="Unduh atau bagikan?"
      >
        <div className="space-y-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void runReportAction('unduh')}
            className={cn(
              appCardClass,
              'w-full p-3.5 text-left flex items-center gap-3 hover:border-emerald-400 disabled:opacity-60'
            )}
          >
            <FileDown className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Unduh PDF</p>
              <p className="text-[11px] text-slate-500">Simpan file laporan ke perangkat.</p>
            </div>
            {busyAction === 'unduh' && (
              <span className="text-[10px] font-bold text-emerald-700 shrink-0">Menyiapkan…</span>
            )}
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void runReportAction('bagikan')}
            className={cn(
              appCardClass,
              'w-full p-3.5 text-left flex items-center gap-3 hover:border-emerald-400 disabled:opacity-60'
            )}
          >
            <Share2 className="w-5 h-5 text-teal-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Bagikan</p>
              <p className="text-[11px] text-slate-500">Kirim file PDF lewat WhatsApp / aplikasi lain.</p>
            </div>
            {busyAction === 'bagikan' && (
              <span className="text-[10px] font-bold text-teal-700 shrink-0">Menyiapkan…</span>
            )}
          </button>
        </div>
      </AppModal>

      <AppModal
        open={santriPickOpen}
        onClose={() => setSantriPickOpen(false)}
        title="Pilih santri"
      >
        <div className="h-full min-h-0 flex flex-col gap-3">
          <input
            type="search"
            value={santriQuery}
            onChange={(e) => setSantriQuery(e.target.value)}
            placeholder="Cari nama / kelas / kamar…"
            className={`${appFieldCompactClass} w-full shrink-0`}
          />
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
            {filteredSantriPick.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Tidak ada santri cocok.</p>
            ) : (
              filteredSantriPick.map((s) => (
                <button
                  key={String(s.id)}
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => {
                    setSantriPickOpen(false);
                    setActionPick({ scope: santriPickFor, santriId: String(s.id) });
                  }}
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

      <AppModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Periode rekap"
        footer={
          <AppModalFooter>
            <Button type="button" variant="outline" className="flex-1 text-xs" onClick={resetRekapFilter}>
              Reset filter
            </Button>
            <Button type="button" className="flex-1 text-xs" onClick={applyRekapFilter}>
              Terapkan
            </Button>
          </AppModalFooter>
        }
      >
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
        </div>
      </AppModal>

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

    </PageWithPullRefresh>
  );
}
