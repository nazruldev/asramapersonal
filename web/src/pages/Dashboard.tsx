import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { useAppStore, useInitialAppLoading } from '@/store/app-store';
import { useAppReload } from '@/hooks/use-app-reload';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useNavigate } from 'react-router';
import { toast } from '@/lib/toast';
import { filterKegiatanForAbsensiDate, type KegiatanSchedule } from '@/lib/kegiatan-schedule';
import {
  Users,
  ClockAlert,
  CheckCircle2,
  AlertTriangle,
  CalendarCheck,
  BedDouble,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  FileText,
  CalendarRange,
  CalendarDays,
  Database,
  Trophy,
  LayoutGrid,
  Wallet,
  GraduationCap,
  MapPin,
  Settings,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { AppModal } from '@/components/ui/app-modal';
import { KegiatanMark } from '@/components/kegiatan-mark';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { buildKamarSlotRows, sumKamarSlotTotals } from '@/lib/kamar-slots';
import { KamarSlotStrip } from '@/components/kamar-slot-strip';
import { kamarDetailPath } from '@/lib/kamar-path';
import { formatIzinBatasKembali, isIzinBatasBelumPasti, isIzinTerlambat } from '@/lib/izin-group';
import {
  buildDashboardAbsensiKegiatan,
  countIzinTerlambat,
  countSantriTanpaKamar,
  totalAbsensiTercatatHariIni,
} from '@/lib/dashboard-summary';
import { fetchAbsensiForDay, type AbsensiApiRow } from '@/lib/absensi-api';
import type { IzinRow } from '@/lib/izin-group';

/** Tombol panah geser daftar horizontal — tampil di header section, hanya ≥sm. */
const scrollNavBtnClass =
  'hidden sm:inline-flex w-6 h-6 rounded-sm border border-slate-300 dark:border-slate-500 bg-card items-center justify-center text-slate-500 hover:text-emerald-700 hover:border-emerald-400 active:scale-95 transition-all shrink-0';

export default function Dashboard() {
  const navigate = useNavigate();
  const reload = useAppReload();
  const loadingStats = useInitialAppLoading();
  const dashboardReady = useReloadKeyReady('dashboard');
  const stats = useAppStore((s) => s.dashboard);
  const settings = useAppStore((s) => s.settings);
  const izinList = useAppStore((s) => s.izin);
  const santriList = useAppStore((s) => s.santri);
  const kamarList = useAppStore((s) => s.kamar);
  const pembinaanList = useAppStore((s) => s.pembinaan);
  const [todayAbsensi, setTodayAbsensi] = useState<AbsensiApiRow[]>([]);
  const [showAllMenu, setShowAllMenu] = useState(false);
  const kamarScrollRef = useRef<HTMLDivElement>(null);
  const scrollRow = useCallback(
    (ref: React.RefObject<HTMLDivElement | null>, dir: 1 | -1) => {
      ref.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });
    },
    []
  );
  const kegiatanRaw = useAppStore((s) => s.kegiatan);

  const todayKey = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (loadingStats) return;
    void fetchAbsensiForDay({ tanggal: todayKey })
      .then((rows) => setTodayAbsensi(rows))
      .catch(() => setTodayAbsensi([]));
  }, [todayKey, loadingStats, stats?.totalSantri]);

  const dailySchedule = useMemo(
    () =>
      filterKegiatanForAbsensiDate(kegiatanRaw as KegiatanSchedule[], todayKey),
    [kegiatanRaw, todayKey]
  );

  const kembaliMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/izin/${id}/kembali`, { method: 'PUT' });
      if (!res.ok) throw new Error('kembali failed');
    },
    onSuccess: () => {
      toast.success('Santri ditandai sudah kembali');
      void reload(['izin', 'dashboard']);
    },
    onError: () => toast.error('Gagal memperbarui status kembali'),
  });

  const activeIzin = izinList.filter((i: any) => i.status_kembali === 'Belum');
  const diAsrama =
    stats?.totalSantri != null
      ? Math.max(0, stats.totalSantri - activeIzin.length)
      : Math.max(0, santriList.length - activeIzin.length);

  const kamarSlotRows = useMemo(
    () =>
      buildKamarSlotRows(
        kamarList as {
          id: string;
          nama: string;
          kapasitas?: number;
          terisi?: number;
          lantai?: string;
          ketua?: string;
        }[]
      ),
    [kamarList]
  );

  const slotTotals = useMemo(() => {
    const fromKamar = sumKamarSlotTotals(kamarSlotRows);
    if (fromKamar.jumlahKamar > 0) return fromKamar;
    const kapasitas = stats?.totalKapasitas ?? 0;
    const terisi = stats?.totalTerisi ?? santriList.length;
    return {
      jumlahKamar: 0,
      kapasitas,
      terisi,
      kosong: stats?.sisaRanjang ?? Math.max(0, kapasitas - terisi),
    };
  }, [kamarSlotRows, stats, santriList.length]);

  const dashboardKamarPreview = kamarSlotRows.slice(0, 6);
  const hasMoreKamar = kamarSlotRows.length > dashboardKamarPreview.length;

  const todayLabel = format(new Date(`${todayKey}T12:00:00`), 'EEEE, d MMMM yyyy', {
    locale: localeId,
  });

  const izinTerlambat = useMemo(() => countIzinTerlambat(izinList), [izinList]);
  const santriTanpaKamar = useMemo(() => countSantriTanpaKamar(santriList), [santriList]);

  const absensiKegiatanHari = useMemo(
    () =>
      buildDashboardAbsensiKegiatan(
        todayKey,
        dailySchedule,
        todayAbsensi,
        santriList as { id: string; kamar?: string }[],
        izinList as IzinRow[]
      ),
    [todayKey, dailySchedule, todayAbsensi, santriList, izinList]
  );

  const absensiRingkas = useMemo(
    () => totalAbsensiTercatatHariIni(absensiKegiatanHari),
    [absensiKegiatanHari]
  );

  const menuIconStyle = { tone: 'text-emerald-700', tile: 'bg-emerald-100 dark:bg-emerald-500/15' };

  const quickActions = [
    { label: 'Absensi', path: '/laporan/absensi', icon: CalendarCheck, ...menuIconStyle },
    { label: 'Izin', path: '/laporan/izin', icon: ClockAlert, ...menuIconStyle },
    { label: 'Catatan BK', path: '/laporan/pembinaan', icon: ShieldAlert, ...menuIconStyle },
    { label: 'Santri', path: '/master/santri', icon: Users, ...menuIconStyle },
    { label: 'Kamar', path: '/master/kamar', icon: BedDouble, ...menuIconStyle },
    { label: 'Pembayaran', path: '/master/pembayaran', icon: Wallet, ...menuIconStyle },
    { label: 'Laporan', path: '/laporan', icon: FileText, ...menuIconStyle },
  ];

  const allMenuGroups = [
    {
      title: 'Operasional Harian',
      items: [
        { label: 'Absensi', path: '/laporan/absensi', icon: CalendarCheck, ...menuIconStyle },
        { label: 'Izin', path: '/laporan/izin', icon: ClockAlert, ...menuIconStyle },
        { label: 'Catatan BK', path: '/laporan/pembinaan', icon: ShieldAlert, ...menuIconStyle },
        { label: 'Penjadwalan', path: '/penjadwalan', icon: CalendarRange, ...menuIconStyle },
        { label: 'Pembayaran', path: '/master/pembayaran', icon: Wallet, ...menuIconStyle },
      ],
    },
    {
      title: 'Data Master',
      items: [
        { label: 'Santri', path: '/master/santri', icon: Users, ...menuIconStyle },
        { label: 'Kamar', path: '/master/kamar', icon: BedDouble, ...menuIconStyle },
        { label: 'Kelas', path: '/master/kelas', icon: GraduationCap, ...menuIconStyle },
        { label: 'Kegiatan', path: '/master/kegiatan', icon: CalendarDays, ...menuIconStyle },
        { label: 'Kelola Data', path: '/master', icon: Database, ...menuIconStyle },
      ],
    },
    {
      title: 'Laporan & Analisis',
      items: [
        { label: 'Laporan', path: '/laporan', icon: FileText, ...menuIconStyle },
        { label: 'Peringkat', path: '/laporan/peringkat', icon: Trophy, ...menuIconStyle },
        { label: 'Sebaran Wilayah', path: '/laporan/wilayah', icon: MapPin, ...menuIconStyle },
      ],
    },
    {
      title: 'Sistem',
      items: [
        { label: 'Pengaturan', path: '/pengaturan', icon: Settings, ...menuIconStyle },
        { label: 'Cadangan Data', path: '/database', icon: Database, ...menuIconStyle },
      ],
    },
  ];

  const refreshDashboard = useCallback(async () => {
    await fetchAbsensiForDay({ tanggal: todayKey })
      .then((rows) => setTodayAbsensi(rows))
      .catch(() => setTodayAbsensi([]));
  }, [todayKey]);

  if (!dashboardReady && loadingStats) {
    return <ListSkeleton rows={10} className="py-2" />;
  }

  return (
    <PageWithPullRefresh
      keys={['dashboard', 'izin', 'santri', 'kamar', 'kegiatan']}
      extraRefresh={refreshDashboard}
      className="space-y-4"
    >
      {/* Hero Welcome Card — full-bleed menempel tepi atas & samping */}
      <div
        className="relative overflow-hidden p-5 -mx-3 sm:-mx-4 -mt-4 shadow-lg border-b border-emerald-500/40 dark:border-emerald-500/25"
      >
        <div className="absolute inset-0 bg-emerald-700 dark:bg-gradient-to-br dark:from-slate-950 dark:via-emerald-950 dark:to-teal-950" aria-hidden />
        <svg
          className="absolute inset-0 w-full h-full text-white opacity-[0.07] pointer-events-none"
          aria-hidden
        >
          <defs>
            <pattern
              id="hero-geo-pattern"
              width="44"
              height="44"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M22 2 L42 22 L22 42 L2 22 Z M22 10 L34 22 L22 34 L10 22 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="22" cy="22" r="2" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-geo-pattern)" />
        </svg>

        <div className="relative z-10 space-y-3 text-white">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-extrabold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
              Ringkasan Hari Ini
            </h2>
          </div>
          <div>
            <p className="text-xs text-emerald-50 mt-1 capitalize drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
              {todayLabel}
            </p>
            <p className="text-[11px] text-white/90 mt-1 leading-relaxed drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
              Pantau absensi, izin, dan slot kamar hari ini.
            </p>
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
            <div className="rounded-sm px-3 py-1.5 bg-black/25 dark:bg-black/35 border border-white/30 backdrop-blur-sm flex items-center gap-2">
              <span className="font-black text-sm tabular-nums text-white">{diAsrama}</span>
              <span className="text-[11px] font-semibold text-emerald-50">Di Asrama</span>
            </div>
            <div className="rounded-sm px-3 py-1.5 bg-black/25 dark:bg-black/35 border border-white/30 backdrop-blur-sm flex items-center gap-2">
              <span className="font-black text-sm tabular-nums text-white">{activeIzin.length}</span>
              <span className="text-[11px] font-semibold text-emerald-50">Sedang Izin</span>
            </div>
            {slotTotals.kapasitas > 0 ? (
              <div className="rounded-sm px-3 py-1.5 bg-black/25 dark:bg-black/35 border border-white/30 backdrop-blur-sm flex items-center gap-2">
                <span className="font-black text-sm tabular-nums text-white">
                  {slotTotals.terisi}/{slotTotals.kapasitas}
                </span>
                <span className="text-[11px] font-semibold text-emerald-50">Slot jiwa</span>
              </div>
            ) : null}
            {izinTerlambat > 0 ? (
              <div className="rounded-sm px-3 py-1.5 bg-rose-500/35 border border-rose-200/40 backdrop-blur-sm flex items-center gap-2">
                <span className="font-black text-sm tabular-nums text-white">{izinTerlambat}</span>
                <span className="text-[11px] font-semibold text-rose-50">Izin terlambat</span>
              </div>
            ) : null}
            {santriTanpaKamar > 0 ? (
              <div className="rounded-sm px-3 py-1.5 bg-amber-500/30 border border-amber-200/40 backdrop-blur-sm flex items-center gap-2">
                <span className="font-black text-sm tabular-nums text-white">{santriTanpaKamar}</span>
                <span className="text-[11px] font-semibold text-amber-50">Belum ada kamar</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Menu Cepat — full-bleed rapat jumbotron; padding luar kiri/kanan/atas dihilangkan */}
      <div className="-mx-3 sm:-mx-4 -mt-4">
        <div className="grid grid-cols-4 gap-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 pt-3 pb-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.path}
                type="button"
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-1.5 py-2 active:scale-95 transition-all"
              >
                <span className={cn('w-11 h-11 rounded-xl flex items-center justify-center', action.tile)}>
                  <Icon className={cn('w-5 h-5', action.tone)} />
                </span>
                <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 leading-tight text-center">
                  {action.label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowAllMenu(true)}
            className="flex flex-col items-center gap-1.5 py-2 active:scale-95 transition-all"
          >
            <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-slate-200 dark:bg-slate-700">
              <LayoutGrid className="w-5 h-5 text-slate-600 dark:text-slate-200" />
            </span>
            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 leading-tight text-center">
              Lainnya
            </span>
          </button>
        </div>
      </div>

      {/* Semua menu, dikelompokkan per kategori */}
      <AppModal
        open={showAllMenu}
        onClose={() => setShowAllMenu(false)}
        title="Semua Menu"
        description="Pilih menu yang ingin dibuka."
      >
        <div className="space-y-4 pb-2">
          {allMenuGroups.map((group) => (
            <div key={group.title}>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                {group.title}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {group.items.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.path}
                      type="button"
                      onClick={() => {
                        setShowAllMenu(false);
                        navigate(action.path);
                      }}
                      className="flex flex-col items-center gap-1.5 py-2 active:scale-95 transition-all"
                    >
                      <span className={cn('w-11 h-11 rounded-xl flex items-center justify-center', action.tile)}>
                        <Icon className={cn('w-5 h-5', action.tone)} />
                      </span>
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 leading-tight text-center">
                        {action.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </AppModal>

      {/* Status ringkas */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Santri */}
        <div 
          onClick={() => navigate('/master/santri')}
          className={cn(appCardClass, 'p-4 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all hover:border-slate-300 dark:hover:border-slate-600')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Total Santri</span>
            <Users className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-900 tabular-nums">
                {loadingStats ? '-' : stats?.totalSantri || santriList.length}
              </span>
              <span className="text-xs font-semibold text-slate-400">jiwa</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {santriTanpaKamar > 0
                ? `${santriTanpaKamar} belum punya kamar`
                : slotTotals.kapasitas > 0
                  ? `${slotTotals.terisi}/${slotTotals.kapasitas} slot terisi`
                  : 'Kelola di Data Kamar'}
            </p>
          </div>
        </div>

        {/* Sedang Izin */}
        <div 
          onClick={() => navigate('/laporan/izin')}
          className={cn(appCardClass, 'p-4 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all hover:border-slate-300 dark:hover:border-slate-600')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Sedang Izin</span>
            <ClockAlert className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
                {loadingStats ? '-' : activeIzin.length}
              </span>
              <span className="text-xs font-semibold text-slate-400">santri</span>
            </div>
            <p className={cn('text-[10px] mt-0.5 font-medium', izinTerlambat > 0 ? 'text-amber-600' : 'text-slate-400')}>
              {izinTerlambat > 0
                ? `${izinTerlambat} lewat batas kembali`
                : activeIzin.length > 0
                  ? 'Pantau kepulangan'
                  : 'Semua di asrama'}
            </p>
          </div>
        </div>

        {/* Absensi hari ini */}
        <div 
          onClick={() => navigate('/laporan/absensi')}
          className={cn(appCardClass, 'p-4 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all hover:border-slate-300 dark:hover:border-slate-600')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Absensi Hari Ini</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-600 tabular-nums">
                {loadingStats ? '-' : absensiRingkas.selesai}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                / {absensiRingkas.kegiatan} kegiatan
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {absensiRingkas.kegiatan === 0
                ? 'Belum ada agenda hari ini'
                : `${absensiRingkas.selesai} agenda selesai dicatat`}
            </p>
          </div>
        </div>

        {/* Slot jiwa kosong */}
        <div 
          onClick={() => navigate('/master/kamar')}
          className={cn(appCardClass, 'p-4 flex flex-col justify-between cursor-pointer active:scale-[0.98] transition-all hover:border-slate-300 dark:hover:border-slate-600')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Slot Kosong</span>
            <BedDouble className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
                {loadingStats ? '-' : slotTotals.kosong}
              </span>
              <span className="text-xs font-semibold text-slate-400">slot</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium truncate">
              {slotTotals.kapasitas > 0
                ? `Dari ${slotTotals.kapasitas} slot jiwa di ${slotTotals.jumlahKamar} kamar`
                : 'Belum ada data kamar'}
            </p>
          </div>
        </div>
      </div>

      {/* Progress absensi per kegiatan */}
      {(loadingStats || absensiKegiatanHari.length > 0) && (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 gap-2">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            Absensi per Kegiatan
          </h3>
          <button
            type="button"
            onClick={() => navigate('/laporan/absensi')}
            className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 hover:underline shrink-0"
          >
            Input absensi <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className={cn(appCardClass, 'p-3 space-y-2.5')}>
          {loadingStats ? (
            <p className="text-xs text-slate-400 py-1">Memuat absensi…</p>
          ) : (
            absensiKegiatanHari.map((row) => {
              const pct =
                row.target > 0 ? Math.min(100, (row.tercatat / row.target) * 100) : row.tercatat > 0 ? 100 : 0;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => navigate('/laporan/absensi')}
                  className="w-full text-left rounded-sm p-2.5 border border-slate-100 dark:border-slate-700 hover:border-emerald-300/80 dark:hover:border-emerald-700 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <KegiatanMark nama={row.nama} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-50 truncate">{row.nama}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{row.waktuLabel}</p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-bold tabular-nums shrink-0',
                        row.selesai ? 'text-emerald-600' : 'text-amber-600'
                      )}
                    >
                      {row.tercatat}/{row.target}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={cn('h-full transition-all', row.selesai ? 'bg-emerald-600' : 'bg-amber-500')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* Slot jiwa per kamar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider truncate">
              Slot Kamar
            </h3>
            {slotTotals.kapasitas > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 font-bold text-[10px] tabular-nums shrink-0">
                {slotTotals.kosong} kosong
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label="Geser kamar ke kiri"
              onClick={() => scrollRow(kamarScrollRef, -1)}
              className={scrollNavBtnClass}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Geser kamar ke kanan"
              onClick={() => scrollRow(kamarScrollRef, 1)}
              className={scrollNavBtnClass}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/master/kamar')}
              className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 hover:underline ml-1"
            >
              Kelola <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {loadingStats ? (
          <div className={cn(appCardClass, 'p-4 text-xs text-slate-400')}>Memuat slot kamar…</div>
        ) : kamarSlotRows.length === 0 ? (
          <EmptyState icon={BedDouble} title="Belum ada kamar" variant="inline" className="py-5">
            <button
              type="button"
              onClick={() => navigate('/master/kamar')}
              className="text-xs font-bold text-emerald-700 dark:text-emerald-400"
            >
              Tambah kamar & kapasitas slot jiwa
            </button>
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {slotTotals.kapasitas > 0 ? (
              <div className={cn(appCardClass, 'p-3 space-y-2')}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <p className="font-bold text-slate-700 dark:text-slate-200">Ringkasan slot jiwa</p>
                  <p className="font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                    {slotTotals.terisi}/{slotTotals.kapasitas}
                  </p>
                </div>
                <div
                  className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={slotTotals.terisi}
                  aria-valuemin={0}
                  aria-valuemax={slotTotals.kapasitas}
                >
                  <div
                    className="h-full bg-emerald-600 transition-all"
                    style={{
                      width: `${Math.min(100, (slotTotals.terisi / slotTotals.kapasitas) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {slotTotals.jumlahKamar} kamar · ikon hijau = terisi · garis putus = kosong
                </p>
              </div>
            ) : null}

            <div ref={kamarScrollRef} className="flex gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-1 px-1 pb-1">
              {kamarSlotRows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(kamarDetailPath(row.id))}
                className={cn(
                  appCardClass,
                  // Button di flex row ikut stretch tinggi — pin konten ke atas (bukan center UA).
                  'w-56 shrink-0 snap-start p-3 text-left flex flex-col justify-start items-stretch',
                  'active:scale-[0.99] transition-transform hover:border-emerald-300/80 dark:hover:border-emerald-700'
                )}
              >
                <div className="flex items-start justify-between gap-2 shrink-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-50 truncate">{row.nama}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {row.lantai || '—'} · {row.terisi}/{row.kapasitas} jiwa
                      {row.ketua ? ` · Ketua: ${row.ketua}` : ''}
                    </p>
                  </div>
                  {row.isFull ? (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-rose-700 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded-sm shrink-0">
                      Penuh
                    </span>
                  ) : row.kosong > 0 ? (
                    <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                      +{row.kosong} slot
                    </span>
                  ) : null}
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <KamarSlotStrip terisi={row.terisi} kapasitas={row.kapasitas} />
                </div>
              </button>
              ))}
            </div>

            {hasMoreKamar ? (
              <button
                type="button"
                onClick={() => navigate('/master/kamar')}
                className="w-full py-2 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
              >
                Lihat semua {kamarSlotRows.length} kamar
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Santri Sedang Izin */}
      {activeIzin.length > 0 && (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Izin Keluar Aktif
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
              {activeIzin.length}
            </span>
          </div>
          <button 
            type="button"
            onClick={() => navigate('/laporan/izin')}
            className="text-xs font-bold text-emerald-700 flex items-center gap-0.5 hover:underline"
          >
            Semua Izin <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2">
            {activeIzin.map((item: any) => {
              const belumPasti = isIzinBatasBelumPasti(String(item.batas_kembali));
              const isLate = !belumPasti && isIzinTerlambat(item as IzinRow);
              return (
                <div 
                  key={item.id}
                  className={cn(
                    appCardClass,
                    'p-4 space-y-3',
                    isLate ? 'border-rose-300 dark:border-rose-800 bg-rose-50/20' : ''
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">{item.santri_nama}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{item.alasan}</p>
                    </div>
                    {belumPasti ? (
                      <span className="text-[10px] font-bold text-sky-800 bg-sky-100 border border-sky-200 px-2.5 py-0.5 rounded-full shrink-0">
                        Belum pasti
                      </span>
                    ) : isLate ? (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-2.5 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Terlambat
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-0.5 rounded-full shrink-0">
                        Masih Izin
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-[11px] text-slate-400 font-medium">
                      Batas Kembali: <strong className={isLate ? 'text-rose-600' : 'text-slate-700'}>
                        {formatIzinBatasKembali(String(item.batas_kembali))}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => kembaliMutation.mutate(item.id)}
                      disabled={kembaliMutation.isPending}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-sm text-[11px] font-bold active:scale-95 transition-all shadow-xs"
                    >
                      Tandai Kembali
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
      </div>
      )}

    </PageWithPullRefresh>
  );
}
