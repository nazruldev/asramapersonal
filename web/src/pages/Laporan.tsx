import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';
import {
  FileDown,
  Users,
  AlertTriangle,
  Share2,
  ChevronRight,
  UserRound,
  ClipboardList,
  CalendarCheck,
  ClockAlert,
  ShieldAlert,
  Trophy,
  BedDouble,
  GraduationCap,
  MapPin,
  Wallet,
  Eye,
} from 'lucide-react';
import { AppModal, AppModalFooter } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { appFieldCompactClass } from '@/lib/form-styles';
import { useAppStore, type EntityRow } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { formatIzinBatasKembali } from '@/lib/izin-group';
import { fetchAbsensiForLaporanPeriod } from '@/lib/absensi-api';
import {
  fetchIzinForLaporanPeriod,
  fetchPembayaranForLaporanPeriod,
  fetchPembinaanForLaporanPeriod,
} from '@/lib/laporan-data-api';
import { getSessionUser, hasModuleAccess, subscribeSessionUser } from '@/lib/app-auth';
import { toast } from '@/lib/toast';
import {
  computeLaporanSummary,
  type LaporanCustomRange,
  type LaporanPeriod,
  type LaporanReportId,
  type LaporanWilayahGeo,
} from '@/lib/laporan-reports';
import type { KegiatanSchedule } from '@/lib/kegiatan-schedule';
import { UNDUH_BANTUAN_BULLET } from '@/lib/file-download-hints';
import {
  laporanHtmlForSelection,
  runLaporanAction,
  shareAllLaporan,
} from '@/lib/laporan-print';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { loadWilayahIndex } from '@/lib/wilayah-index';

const reportCardClass = cn(
  appCardClass,
  'w-full p-4 text-left flex items-center gap-3 hover:border-emerald-400 dark:hover:border-emerald-600 active:scale-[0.99] transition-all disabled:opacity-60'
);

type ReportScope = 'lengkap' | 'persantri' | LaporanReportId;

const SINGLE_REPORTS: {
  id: LaporanReportId;
  title: string;
  desc: string;
  icon: typeof FileDown;
  tone: string;
  perSantri?: boolean;
  modul?: 'pembayaran';
}[] = [
  { id: 'absensi', title: 'Rekap Absensi', desc: 'Ringkasan kehadiran santri di seluruh data.', icon: CalendarCheck, tone: 'text-emerald-600', perSantri: true },
  { id: 'izin', title: 'Rekap Perizinan', desc: 'Daftar izin keluar, kembali, dan yang melewati batas.', icon: ClockAlert, tone: 'text-emerald-600', perSantri: true },
  { id: 'pembinaan', title: 'Rekap Pelanggaran', desc: 'Catatan pelanggaran di seluruh data.', icon: ShieldAlert, tone: 'text-emerald-600', perSantri: true },
  {
    id: 'pelanggaran',
    title: 'Peringkat Pelanggaran',
    desc: 'Santri dengan catatan pelanggaran terbanyak di seluruh data.',
    icon: Trophy,
    tone: 'text-emerald-600',
  },
  { id: 'kamar', title: 'Rekap Hunian Kamar', desc: 'Okupansi dan penghuni tiap kamar.', icon: BedDouble, tone: 'text-emerald-600' },
  { id: 'kelas', title: 'Rekap Santri per Kelas', desc: 'Jumlah dan daftar santri per kelas.', icon: GraduationCap, tone: 'text-emerald-600' },
  { id: 'wilayah', title: 'Sebaran Asal Wilayah', desc: 'Distribusi santri berdasarkan wilayah asal.', icon: MapPin, tone: 'text-emerald-600' },
  {
    id: 'pembayaran',
    title: 'Rekap Pembayaran',
    desc: 'Ringkasan tagihan, belum lunas dalam tempo, dan tunggakan (sudah jatuh tempo).',
    icon: Wallet,
    tone: 'text-emerald-600',
    modul: 'pembayaran',
  },
];

export default function Laporan() {
  const navigate = useNavigate();
  const dashboardReady = useReloadKeyReady('dashboard');
  const santriReady = useReloadKeyReady('santri');
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const settings = useAppStore((s) => s.settings);
  const stats = useAppStore((s) => s.dashboard);
  const santri = useAppStore((s) => s.santri);
  const kamar = useAppStore((s) => s.kamar);
  const kegiatanMaster = useAppStore((s) => s.kegiatan) as KegiatanSchedule[];
  // Cakupan tanggal dipilih per-laporan lewat modal — halaman ini selalu 'all'.
  const period: LaporanPeriod = 'all';
  const customRange: LaporanCustomRange | undefined = undefined;
  const [periodLoading, setPeriodLoading] = useState(false);
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  const [periodAbsensi, setPeriodAbsensi] = useState<EntityRow[]>([]);
  const [periodIzin, setPeriodIzin] = useState<EntityRow[]>([]);
  const [periodPembinaan, setPeriodPembinaan] = useState<EntityRow[]>([]);
  const [periodTagihan, setPeriodTagihan] = useState<EntityRow[]>([]);
  const [sharingAll, setSharingAll] = useState(false);
  const [santriPickOpen, setSantriPickOpen] = useState(false);
  const [scopePickOpen, setScopePickOpen] = useState<ReportScope | null>(null);
  const [santriPickFor, setSantriPickFor] = useState<ReportScope>('persantri');
  const [santriChecked, setSantriChecked] = useState<string[]>([]);
  const [actionPick, setActionPick] = useState<{
    scope: ReportScope;
    santriId?: string;
    santriIds?: string[];
  } | null>(null);
  const [rangeDari, setRangeDari] = useState('');
  const [rangeSampai, setRangeSampai] = useState('');
  const [useRange, setUseRange] = useState(false);
  const [datePickOpen, setDatePickOpen] = useState(false);
  const [pendingPick, setPendingPick] = useState<{
    scope: ReportScope;
    santriId?: string;
    santriIds?: string[];
  } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ html: string; title: string } | null>(null);

  const openDatePick = useCallback(
    (pick: { scope: ReportScope; santriId?: string; santriIds?: string[] }) => {
      setPendingPick(pick);
      setUseRange(false);
      setRangeDari('');
      setRangeSampai('');
      setDatePickOpen(true);
    },
    []
  );
  const [busyAction, setBusyAction] = useState<'unduh' | 'bagikan' | 'preview' | null>(null);
  const [santriQuery, setSantriQuery] = useState('');
  const [wilayahProvinsiGeo, setWilayahProvinsiGeo] = useState<LaporanWilayahGeo[]>([]);

  const loading = !dashboardReady || !santriReady;

  useEffect(() => subscribeSessionUser(() => setSessionUser(getSessionUser())), []);

  const canPembayaran = hasModuleAccess(sessionUser, 'pembayaran');

  const visibleReports = useMemo(
    () =>
      SINGLE_REPORTS.filter(
        (r) => !r.modul || hasModuleAccess(sessionUser, r.modul)
      ),
    [sessionUser]
  );

  const refetchPeriodData = useCallback(async () => {
    setPeriodLoading(true);
    try {
      const jobs: Promise<unknown>[] = [
      fetchAbsensiForLaporanPeriod(period, customRange),
      fetchIzinForLaporanPeriod(period, customRange),
      fetchPembinaanForLaporanPeriod(period, customRange),
    ];
    if (canPembayaran) {
      jobs.push(fetchPembayaranForLaporanPeriod(period, customRange));
    }
      const [abs, iz, pb, tagihan] = await Promise.all(jobs);
      setPeriodAbsensi(abs as EntityRow[]);
      setPeriodIzin(iz as EntityRow[]);
      setPeriodPembinaan(pb as EntityRow[]);
      setPeriodTagihan(canPembayaran ? ((tagihan as EntityRow[]) ?? []) : []);
    } finally {
      setPeriodLoading(false);
    }
  }, [period, customRange, canPembayaran]);

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
      tagihan: periodTagihan,
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
      periodTagihan,
      kegiatanMaster,
      wilayahProvinsiGeo,
    ]
  );

  const summary = useMemo(() => computeLaporanSummary(ctx), [ctx]);

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
    async (action: 'unduh' | 'bagikan' | 'preview') => {
      if (!actionPick) return;
      const { scope, santriId, santriIds } = actionPick;
      const ids = santriIds ?? (santriId ? [santriId] : undefined);
      const range =
        useRange && (rangeDari || rangeSampai)
          ? { dari: rangeDari || undefined, sampai: rangeSampai || undefined }
          : undefined;
      setBusyAction(action);
      try {
        if (action === 'preview') {
          const doc = laporanHtmlForSelection(scope, ctx, { santriIds: ids, range });
          setPreviewDoc({ html: doc.html, title: doc.title });
        } else {
          await runLaporanAction(action, scope, ctx, { santriIds: ids, range });
        }
        setActionPick(null);
      } catch {
        toast.error(
          action === 'unduh'
            ? 'Gagal mengunduh laporan'
            : action === 'bagikan'
              ? 'Gagal membagikan laporan'
              : 'Gagal membuka pratinjau laporan'
        );
      } finally {
        setBusyAction(null);
      }
    },
    [actionPick, ctx, rangeDari, rangeSampai, useRange]
  );

  return (
    <PageWithPullRefresh
      keys={['dashboard', 'santri', 'kamar', 'kegiatan', 'settings']}
      extraRefresh={extraLaporanRefresh}
      className="space-y-5 pb-2"
    >
      {/* Pilih tipe laporan — kartu 1 kolom ke bawah */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
          Pilih Jenis Laporan · v0.1.6
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
                Semua bagian laporan dalam satu file (harian, pelanggaran, kelas, peringkat).
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

          {visibleReports.map((r) => {
            const RIcon = r.icon;
            return (
              <button
                key={r.id}
                type="button"
                disabled={loading || busyAction !== null}
                onClick={() => (r.perSantri ? setScopePickOpen(r.id) : openDatePick({ scope: r.id }))}
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
                Ringkasan harian + pelanggaran — langsung dibagikan sebagai teks WA.
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
              : `Cakupan ${visibleReports.find((r) => r.id === scopePickOpen)?.title ?? 'laporan'}`
        }
      >
        <div className="space-y-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              const scope = scopePickOpen;
              setScopePickOpen(null);
              if (scope) openDatePick({ scope });
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
              setSantriChecked([]);
              setSantriPickOpen(true);
            }}
            className={cn(
              appCardClass,
              'w-full p-3.5 text-left flex items-center gap-3 hover:border-emerald-400 disabled:opacity-60'
            )}
          >
            <UserRound className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Pilih santri</p>
              <p className="text-[11px] text-slate-500">Centang satu atau beberapa santri untuk dicetak.</p>
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

      {/* Modal pilih aksi: preview, unduh, atau bagikan */}
      <AppModal
        open={actionPick !== null}
        onClose={() => setActionPick(null)}
        title="Preview, unduh, atau bagikan?"
      >
        <div className="space-y-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void runReportAction('preview')}
            className={cn(
              appCardClass,
              'w-full p-3.5 text-left flex items-center gap-3 hover:border-emerald-400 disabled:opacity-60'
            )}
          >
            <Eye className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Preview</p>
              <p className="text-[11px] text-slate-500">Buka pratinjau laporan di tab baru.</p>
            </div>
            {busyAction === 'preview' && (
              <span className="text-[10px] font-bold text-blue-700 shrink-0">Menyiapkan…</span>
            )}
          </button>
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

      {/* Modal pilih tanggal: default semua data, opsional rentang */}
      <AppModal
        open={datePickOpen}
        onClose={() => setDatePickOpen(false)}
        title="Cakupan tanggal laporan"
        footer={
          <AppModalFooter>
            <Button
              type="button"
              className="flex-1 text-xs"
              disabled={
                useRange &&
                ((rangeDari !== '') !== (rangeSampai !== '') ||
                  (rangeDari !== '' && rangeSampai !== '' && rangeDari > rangeSampai)
              )}
              onClick={() => {
                setDatePickOpen(false);
                if (pendingPick) setActionPick(pendingPick);
              }}
            >
              OK
            </Button>
          </AppModalFooter>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="cakupan-tanggal"
                className="w-4 h-4 accent-emerald-600"
                checked={!useRange}
                onChange={() => setUseRange(false)}
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Semua data
              </span>
              <span className="text-[10px] text-slate-500">— tanpa batas tanggal</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="cakupan-tanggal"
                className="w-4 h-4 accent-emerald-600"
                checked={useRange}
                onChange={() => setUseRange(true)}
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Pilih rentang tanggal sendiri
              </span>
            </label>
          </div>
          {!useRange ? (
            <p className="text-[11px] text-slate-500">
              Semua data akan dicetak tanpa batas tanggal.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Hari ini', range: () => [todayKey, todayKey] as const },
                  {
                    label: '7 hari',
                    range: () =>
                      [format(subDays(new Date(), 6), 'yyyy-MM-dd'), todayKey] as const,
                  },
                  {
                    label: 'Minggu ini',
                    range: () =>
                      [
                        format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
                        todayKey,
                      ] as const,
                  },
                  {
                    label: 'Bulan ini',
                    range: () =>
                      [format(startOfMonth(new Date()), 'yyyy-MM-dd'), todayKey] as const,
                  },
                  {
                    label: 'Tahun ini',
                    range: () =>
                      [format(startOfYear(new Date()), 'yyyy-MM-dd'), todayKey] as const,
                  },
                ].map((s) => {
                  const [d, t] = s.range();
                  const active = rangeDari === d && rangeSampai === t;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        setRangeDari(d);
                        setRangeSampai(t);
                      }}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors',
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400'
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Dari tanggal
                  </span>
                  <input
                    type="date"
                    value={rangeDari}
                    onChange={(e) => setRangeDari(e.target.value)}
                    className={`${appFieldCompactClass} w-full`}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Sampai tanggal
                  </span>
                  <input
                    type="date"
                    value={rangeSampai}
                    onChange={(e) => setRangeSampai(e.target.value)}
                    className={`${appFieldCompactClass} w-full`}
                  />
                </label>
              </div>
              {rangeDari && rangeSampai && rangeDari > rangeSampai && (
                <p className="text-[11px] text-rose-600 font-semibold">
                  Rentang tanggal tidak valid.
                </p>
              )}
            </>
          )}
        </div>
      </AppModal>

      {/* Modal pratinjau laporan (in-app, tidak buka tab baru) */}
      <AppModal
        open={previewDoc !== null}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.title ?? 'Pratinjau laporan'}
      >
        {previewDoc && (
          <iframe
            title="Pratinjau laporan"
            srcDoc={previewDoc.html}
            className="w-full h-[70vh] rounded-lg border border-slate-200 dark:border-slate-700 bg-white"
          />
        )}
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
          <label className="flex items-center gap-2.5 px-1 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-emerald-600"
              checked={
                filteredSantriPick.length > 0 &&
                filteredSantriPick.every((s) => santriChecked.includes(String(s.id)))
              }
              onChange={(e) => {
                const ids = filteredSantriPick.map((s) => String(s.id));
                setSantriChecked((prev) =>
                  e.target.checked
                    ? [...new Set([...prev, ...ids])]
                    : prev.filter((id) => !ids.includes(id))
                );
              }}
            />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Pilih semua ({filteredSantriPick.length})
            </span>
            {santriChecked.length > 0 && (
              <span className="ml-auto text-[10px] font-bold text-emerald-700">
                {santriChecked.length} dipilih
              </span>
            )}
          </label>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
            {filteredSantriPick.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Tidak ada santri cocok.</p>
            ) : (
              filteredSantriPick.map((s) => {
                const sid = String(s.id);
                const checked = santriChecked.includes(sid);
                return (
                  <label
                    key={sid}
                    className={cn(
                      appCardClass,
                      'w-full p-3 flex items-center gap-3 cursor-pointer',
                      checked
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
                        : 'hover:border-emerald-400'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-emerald-600 shrink-0"
                      checked={checked}
                      onChange={() =>
                        setSantriChecked((prev) =>
                          checked ? prev.filter((id) => id !== sid) : [...prev, sid]
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                        {String(s.nama ?? 'Santri')}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {String(s.kelas ?? '—')} · Kamar {String(s.kamar ?? '—')}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <Button
            type="button"
            className="w-full shrink-0 text-xs"
            disabled={santriChecked.length === 0}
            onClick={() => {
              setSantriPickOpen(false);
              openDatePick({ scope: santriPickFor, santriIds: santriChecked });
            }}
          >
            Lanjut ({santriChecked.length} santri)
          </Button>
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
