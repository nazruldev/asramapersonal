import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useAppReload } from '@/hooks/use-app-reload';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { format, subDays } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import {
  CalendarOff,
  CheckCheck,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Undo2,
  Users,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { ScrollNavButtons } from '@/components/scroll-nav-buttons';
import { HeaderNeutralButton } from '@/components/header-action-button';
import { toast } from '@/lib/toast';
import {
  evaluateKegiatanAbsensiWindow,
  filterKegiatanForAbsensiDate,
  formatWaktuKegiatan,
  sortKegiatanForAbsensiTabs,
  type KegiatanSchedule,
} from '@/lib/kegiatan-schedule';
import { appFieldCompactClass } from '@/lib/form-styles';
import { appCardClass, appTabActiveClass, appTabIdleClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { fetchAbsensiForDay, type AbsensiApiRow } from '@/lib/absensi-api';
import { AppLoadingIndicator } from '@/components/app-loading-indicator';
import { useAppZonaWaktu } from '@/hooks/use-app-zona-waktu';
import {
  formatDateTimeInZona,
  getIndonesiaTimezoneMeta,
  getZonedClock,
} from '@/lib/indonesia-timezone';
import { isSantriOnIzinForDate, type IzinRow } from '@/lib/izin-group';

function toDateKey(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function dateIsoForKey(key: string) {
  return new Date(`${key}T12:00:00`).toISOString();
}

type AbsensiRow = {
  id: string;
  santri_id: string;
  kegiatan: string;
  tanggal: string;
  status: string;
};

const ATTENDANCE_STATUSES = [
  {
    status: 'Alpa',
    code: 'A',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-sm',
    idleClass: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100',
  },
  {
    status: 'Izin',
    code: 'I',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-sm',
    idleClass: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
  },
  {
    status: 'Hadir',
    code: 'H',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
    idleClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
  },
  {
    status: 'Sakit',
    code: 'S',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-sm',
    idleClass: 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100',
  },
] as const;

function statusCode(status: string) {
  return ATTENDANCE_STATUSES.find((s) => s.status === status)?.code ?? status.charAt(0);
}

export default function Absensi() {
  const location = useLocation();
  const isAbsensiScreen = location.pathname === '/laporan/absensi';
  const zonaWaktu = useAppZonaWaktu();
  const reload = useAppReload();
  const [clockNow, setClockNow] = useState(() => new Date());
  const agendaScrollRef = useRef<HTMLDivElement>(null);
  const [activeKegiatan, setActiveKegiatan] = useState('');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('Semua Kamar');
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));
  const [presensiTab, setPresensiTab] = useState<'belum' | 'sudah'>('belum');
  const [filterOpen, setFilterOpen] = useState(false);
  const [dayAbsensi, setDayAbsensi] = useState<AbsensiApiRow[]>([]);
  const [dayAbsensiLoading, setDayAbsensiLoading] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const dateShortcuts = useMemo(
    () => [
      { label: 'Hari Ini', key: toDateKey(new Date()) },
      { label: 'Kemarin', key: toDateKey(subDays(new Date(), 1)) },
      { label: '2 Hari Lalu', key: toDateKey(subDays(new Date(), 2)) },
      { label: '3 Hari Lalu', key: toDateKey(subDays(new Date(), 3)) },
      { label: '7 Hari Lalu', key: toDateKey(subDays(new Date(), 7)) },
    ],
    []
  );

  const kegiatanMaster = useAppStore((s) => s.kegiatan) as KegiatanSchedule[];
  const agendaUntukTanggal = useMemo(
    () => filterKegiatanForAbsensiDate(kegiatanMaster, selectedDateKey),
    [kegiatanMaster, selectedDateKey]
  );

  const refreshDayAbsensi = useCallback(async () => {
    setDayAbsensiLoading(true);
    try {
      const rows = await fetchAbsensiForDay({ tanggal: selectedDateKey });
      setDayAbsensi(rows);
    } catch {
      toast.error('Gagal memuat absensi hari ini');
    } finally {
      setDayAbsensiLoading(false);
    }
  }, [selectedDateKey]);

  useEffect(() => {
    void refreshDayAbsensi();
  }, [refreshDayAbsensi]);

  const activeKegiatanMeta = agendaUntukTanggal.find((k) => k.nama === activeKegiatan);

  const santriList = useAppStore((s) => s.santri) as {
    id: string;
    nama: string;
    kelas: string;
    kamar?: string;
  }[];
  const izinList = useAppStore((s) => s.izin) as unknown as IzinRow[];

  const addAbsenMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/absensi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Gagal menyimpan absensi');
      return data;
    },
    onSuccess: (_data, variables) => {
      const status = String(variables.status ?? '');
      const santriId = String(variables.santri_id ?? '');
      const nama =
        santriList.find((s) => s.id === santriId)?.nama ?? 'Santri';
      toast.success(`${nama} dicatat ${status}`);
      void refreshDayAbsensi();
      void reload('dashboard');
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan absensi'),
  });

  const rollbackAbsenMutation = useMutation({
    mutationFn: async (absensiId: string) => {
      const res = await fetch(`/api/absensi/${absensiId}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Gagal membatalkan absensi');
      }
    },
    onSuccess: () => {
      toast.success('Absensi dibatalkan');
      void refreshDayAbsensi();
      void reload('dashboard');
      setPresensiTab('belum');
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Gagal membatalkan absensi'),
  });

  const tanggalIso = dateIsoForKey(selectedDateKey);

  const getRecordedEntry = (santriId: string): AbsensiRow | undefined =>
    dayAbsensi.find(
      (a) => a.santri_id === santriId && (!activeKegiatan || a.kegiatan === activeKegiatan)
    ) as AbsensiRow | undefined;

  const getRecordedStatus = (santriId: string) => getRecordedEntry(santriId)?.status;

  const zonedNow = useMemo(
    () => getZonedClock(clockNow, zonaWaktu),
    [clockNow, zonaWaktu]
  );
  const todayKey = zonedNow.dateKey;

  const activeAbsensiWindow = useMemo(() => {
    if (!activeKegiatanMeta) return null;
    return evaluateKegiatanAbsensiWindow(
      activeKegiatanMeta,
      selectedDateKey,
      todayKey,
      zonedNow.minutesOfDay
    );
  }, [activeKegiatanMeta, selectedDateKey, todayKey, zonedNow.minutesOfDay]);

  const canRecordAbsensi = activeAbsensiWindow?.enabled ?? false;

  const windowByKegiatan = useMemo(() => {
    const map = new Map<string, ReturnType<typeof evaluateKegiatanAbsensiWindow>>();
    for (const keg of agendaUntukTanggal) {
      map.set(
        keg.nama,
        evaluateKegiatanAbsensiWindow(keg, selectedDateKey, todayKey, zonedNow.minutesOfDay)
      );
    }
    return map;
  }, [agendaUntukTanggal, selectedDateKey, todayKey, zonedNow.minutesOfDay]);

  const agendaSorted = useMemo(
    () =>
      sortKegiatanForAbsensiTabs(agendaUntukTanggal, (keg) =>
        windowByKegiatan.get(keg.nama) ??
        evaluateKegiatanAbsensiWindow(keg, selectedDateKey, todayKey, zonedNow.minutesOfDay)
      ),
    [agendaUntukTanggal, windowByKegiatan, selectedDateKey, todayKey, zonedNow.minutesOfDay]
  );

  const firstOpenKegiatanNama = useMemo(() => {
    const open = agendaSorted.find((k) => windowByKegiatan.get(k.nama)?.enabled);
    return open?.nama ?? agendaSorted[0]?.nama ?? '';
  }, [agendaSorted, windowByKegiatan]);

  useEffect(() => {
    if (agendaSorted.length === 0) {
      if (activeKegiatan) setActiveKegiatan('');
      return;
    }
    if (!agendaSorted.some((k) => k.nama === activeKegiatan)) {
      setActiveKegiatan(firstOpenKegiatanNama);
    }
  }, [agendaSorted, activeKegiatan, firstOpenKegiatanNama]);

  const recordAttendance = (santriId: string, status: string) => {
    if (!activeKegiatan || !canRecordAbsensi) return;
    addAbsenMutation.mutate({
      santri_id: santriId,
      kegiatan: activeKegiatan,
      tanggal: tanggalIso,
      status,
    });
  };

  const roomNames = [
    'Semua Kamar',
    ...Array.from(new Set(santriList.map((s: { kamar?: string }) => s.kamar).filter(Boolean))),
  ];

  const visibleSantri = santriList.filter((s: { kamar?: string }) => {
    if (selectedRoomFilter === 'Semua Kamar') return true;
    return s.kamar === selectedRoomFilter;
  });

  const santriSedangIzin = visibleSantri.filter((s: { id: string }) =>
    isSantriOnIzinForDate(izinList, s.id, selectedDateKey)
  );

  const isLockedIzinAbsensi = (santriId: string) =>
    isSantriOnIzinForDate(izinList, santriId, selectedDateKey);

  const belumDiabsen = visibleSantri.filter(
    (s: { id: string }) => !isLockedIzinAbsensi(s.id) && !getRecordedStatus(s.id)
  );
  const sudahDicatat = visibleSantri.filter(
    (s: { id: string }) => isLockedIzinAbsensi(s.id) || Boolean(getRecordedStatus(s.id))
  );

  const listForTab = presensiTab === 'belum' ? belumDiabsen : sudahDicatat;

  const belumCountByKegiatan = useMemo(() => {
    const map = new Map<string, number>();
    for (const keg of agendaUntukTanggal) {
      const nama = keg.nama;
      const count = visibleSantri.filter(
        (s: { id: string }) =>
          !isLockedIzinAbsensi(s.id) &&
          !dayAbsensi.some((a) => a.santri_id === s.id && a.kegiatan === nama)
      ).length;
      map.set(nama, count);
    }
    return map;
  }, [agendaUntukTanggal, visibleSantri, dayAbsensi, izinList, selectedDateKey]);

  const izinAutoSyncKey = useMemo(
    () =>
      [
        selectedDateKey,
        activeKegiatan,
        santriSedangIzin.map((s: { id: string }) => s.id).join(','),
        dayAbsensi
          .filter((a) => a.kegiatan === activeKegiatan)
          .map((a) => `${a.santri_id}:${a.status}`)
          .join(','),
      ].join('|'),
    [selectedDateKey, activeKegiatan, santriSedangIzin, dayAbsensi]
  );

  useEffect(() => {
    if (!activeKegiatan || dayAbsensiLoading || !canRecordAbsensi) return;
    const needIzinRecord = santriSedangIzin.filter(
      (s: { id: string }) => getRecordedStatus(s.id) !== 'Izin'
    );
    if (needIzinRecord.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const santri of needIzinRecord) {
        if (cancelled) return;
        const res = await fetch('/api/absensi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            santri_id: santri.id,
            kegiatan: activeKegiatan,
            tanggal: tanggalIso,
            status: 'Izin',
          }),
        });
        if (!res.ok) {
          toast.error('Gagal mencatat absensi izin otomatis');
          return;
        }
      }
      if (!cancelled) {
        void refreshDayAbsensi();
        void reload('dashboard');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    izinAutoSyncKey,
    activeKegiatan,
    dayAbsensiLoading,
    canRecordAbsensi,
    refreshDayAbsensi,
    reload,
    tanggalIso,
  ]);

  const handleBulkAllPresent = async () => {
    if (!activeKegiatan || belumDiabsen.length === 0 || !canRecordAbsensi) return;
    for (const santri of belumDiabsen) {
      await fetch('/api/absensi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          santri_id: santri.id,
          kegiatan: activeKegiatan,
          tanggal: tanggalIso,
          status: 'Hadir',
        }),
      });
    }
    toast.success('Semua santri ditandai hadir');
    void refreshDayAbsensi();
    void reload('dashboard');
  };

  const selectedDateLabel = format(new Date(`${selectedDateKey}T12:00:00`), 'EEEE, d MMMM yyyy', {
    locale: localeId,
  });
  const liveTimeLabel = formatDateTimeInZona(clockNow, zonaWaktu, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const zonaShort = getIndonesiaTimezoneMeta(zonaWaktu).shortLabel;

  const activeWaktuLabel = useMemo(() => {
    if (!activeKegiatanMeta) return '';
    const m = activeKegiatanMeta;
    if (m.waktu === 'Sesuai waktu sholat') {
      const jam = formatWaktuKegiatan(m.jam_mulai, m.jam_selesai);
      return jam ? `${m.waktu} (${jam})` : m.waktu;
    }
    return formatWaktuKegiatan(m.jam_mulai, m.jam_selesai) || m.waktu || '';
  }, [activeKegiatanMeta]);

  const hasActiveFilter =
    selectedDateKey !== todayKey || selectedRoomFilter !== 'Semua Kamar';

  const openFilter = useCallback(() => setFilterOpen(true), []);

  const headerFilterAction = useMemo(
    () => (
      <HeaderNeutralButton
        onClick={openFilter}
        label="Filter tanggal dan kamar"
        className="relative"
      >
        <SlidersHorizontal className="w-5 h-5" />
        {hasActiveFilter ? (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-white" />
        ) : null}
      </HeaderNeutralButton>
    ),
    [hasActiveFilter, openFilter]
  );

  useScreenHeaderActions(isAbsensiScreen ? headerFilterAction : null, [
    isAbsensiScreen,
    headerFilterAction,
  ]);

  const pickDate = (key: string) => {
    setSelectedDateKey(key);
    setPresensiTab('belum');
    setActiveKegiatan('');
  };

  const closedAbsensiEmpty = useMemo(() => {
    if (!activeAbsensiWindow || activeAbsensiWindow.enabled) return null;
    const rentang = activeWaktuLabel || 'Lihat jam di Master → Kegiatan';
    if (activeAbsensiWindow.state === 'belum_mulai') {
      return {
        title: 'Belum waktu untuk absensi',
        description:
          activeAbsensiWindow.hint ??
          `Absensi untuk kegiatan ini dibuka sesuai jadwal. Rentang: ${rentang}.`,
      };
    }
    if (activeAbsensiWindow.state === 'selesai') {
      return {
        title: 'Rentang absensi sudah lewat',
        description:
          activeAbsensiWindow.hint ??
          `Tidak bisa mencatat presensi baru. Rentang: ${rentang}. Lihat tab Sudah atau pilih tanggal kemarin untuk koreksi.`,
      };
    }
    return {
      title: 'Absensi belum bisa dicatat',
      description: activeAbsensiWindow.hint ?? 'Pilih kegiatan lain atau sesuaikan tanggal.',
    };
  }, [activeAbsensiWindow, activeWaktuLabel]);

  const resetFilters = () => {
    setSelectedDateKey(todayKey);
    setSelectedRoomFilter('Semua Kamar');
    setPresensiTab('belum');
    setFilterOpen(false);
  };

  const refreshAbsensiScreen = useCallback(async () => {
    await reload(['santri', 'kamar', 'kegiatan', 'izin', 'dashboard']);
    await refreshDayAbsensi();
  }, [reload, refreshDayAbsensi]);

  return (
    <PageWithPullRefresh
      keys={['santri', 'kamar', 'kegiatan', 'izin', 'dashboard']}
      extraRefresh={refreshAbsensiScreen}
      className="space-y-3"
    >
      <div className="text-center -mt-1 space-y-0.5">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug">
          {selectedDateLabel}
        </p>
        {agendaUntukTanggal.length > 0 ? (
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums tracking-wide">
            {liveTimeLabel} {zonaShort}
          </p>
        ) : null}
        {selectedRoomFilter !== 'Semua Kamar' ? (
          <p className="text-[11px] text-slate-500 truncate">{selectedRoomFilter}</p>
        ) : null}
      </div>

      <AppModal open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter">
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Tanggal</p>
            <input
              type="date"
              value={selectedDateKey}
              max={todayKey}
              onChange={(e) => pickDate(e.target.value)}
              className={`${appFieldCompactClass} w-full`}
            />
            <div className="flex flex-wrap gap-1.5">
              {dateShortcuts.map((s) => {
                const active = selectedDateKey === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => pickDate(s.key)}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-sm text-xs font-bold transition-all ${
                      active ? 'bg-emerald-700 text-white' : 'bg-slate-50 text-slate-600 border border-slate-200/70'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">Kamar</p>
            <div className="flex flex-wrap gap-1.5">
              {roomNames.map((room) => {
                const isSelected = selectedRoomFilter === room;
                return (
                  <button
                    key={room as string}
                    type="button"
                    onClick={() => setSelectedRoomFilter(room as string)}
                    className={`whitespace-nowrap px-2.5 py-1 rounded-sm text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-50 text-slate-600 border border-slate-200/70'
                    }`}
                  >
                    {room as string}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 text-xs" onClick={resetFilters}>
              Reset filter
            </Button>
            <Button type="button" className="flex-1 text-xs" onClick={() => setFilterOpen(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </AppModal>

      <div className="space-y-1.5">
        {agendaUntukTanggal.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title="Belum ada agenda"
            description="Atur di Kelola Data → Kegiatan."
            variant="inline"
          />
        ) : (
          <div className="flex items-center gap-1">
          <div
            ref={agendaScrollRef}
            className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 scroll-px-3 sm:scroll-px-4"
          >
            {agendaSorted.map((keg) => {
              const isSelected = activeKegiatan === keg.nama;
              const belumCount = belumCountByKegiatan.get(keg.nama) ?? 0;
              const win = windowByKegiatan.get(keg.nama);
              const isOpen = win?.enabled ?? true;
              return (
                <button
                  key={keg.id}
                  type="button"
                  onClick={() => {
                    setActiveKegiatan(keg.nama);
                    setPresensiTab('belum');
                  }}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-sm text-xs font-bold transition-all shrink-0 active:scale-95 ${
                    isSelected
                      ? 'bg-emerald-700 text-white'
                      : isOpen
                        ? 'bg-slate-50 text-slate-600 border border-slate-200/70'
                        : 'bg-slate-100/80 text-slate-400 border border-slate-200/50'
                  }`}
                  title={!isOpen && win?.hint ? win.hint : undefined}
                >
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      isOpen ? 'bg-emerald-500' : 'bg-slate-300'
                    )}
                    aria-hidden
                  />
                  <span>{keg.nama}</span>
                  <span
                    className={cn(
                      'tabular-nums text-[10px] font-bold min-w-[1.125rem] px-1 py-0.5 rounded-sm text-center leading-none',
                      belumCount > 0
                        ? isSelected
                          ? 'bg-white/25 text-white'
                          : 'bg-amber-100 text-amber-800'
                        : isSelected
                          ? 'bg-white/15 text-emerald-100'
                          : 'bg-slate-200/80 text-slate-500'
                    )}
                  >
                    {belumCount}
                  </span>
                </button>
              );
            })}
          </div>
          <ScrollNavButtons target={agendaScrollRef} />
          </div>
        )}
      </div>

      {activeKegiatan && (
        <div
          className={cn(
            'rounded-sm px-2.5 py-2 text-[11px] leading-snug',
            canRecordAbsensi
              ? 'bg-emerald-900 text-white'
              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
          )}
        >
          {activeWaktuLabel ? (
            <p
              className={cn(
                'truncate',
                canRecordAbsensi ? 'text-emerald-200/90' : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {activeWaktuLabel}
            </p>
          ) : null}
          {!canRecordAbsensi && activeAbsensiWindow?.hint ? (
            <p className="font-semibold text-amber-800 dark:text-amber-300/90">
              {activeAbsensiWindow.hint}
            </p>
          ) : canRecordAbsensi && activeAbsensiWindow?.state === 'open' ? (
            <p className="font-semibold text-emerald-100">Sedang dalam rentang absensi</p>
          ) : null}
          <p className="font-semibold tabular-nums">
            {sudahDicatat.length}/{visibleSantri.length} tercatat
            {santriSedangIzin.length > 0 ? ` · ${santriSedangIzin.length} izin (otomatis)` : ''}
          </p>
        </div>
      )}

      {santriSedangIzin.length > 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200/70 rounded-sm px-2.5 py-1.5 truncate">
          <span className="font-semibold">{santriSedangIzin.length} sedang izin:</span>{' '}
          {santriSedangIzin.map((s: { nama: string }) => s.nama).join(', ')} — tercatat{' '}
          <span className="font-semibold">I</span> di tab Sudah tiap kegiatan, tidak bisa dibatalkan.
        </p>
      )}

      {agendaUntukTanggal.length > 0 && (
      <div className="space-y-2">
        {activeKegiatan && (
        <div className="flex items-center gap-1 p-0.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-sm border border-slate-200/60 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setPresensiTab('belum')}
            className={`flex-1 py-2 px-2 rounded-sm text-[11px] font-bold transition-all active:scale-[0.98] ${
              presensiTab === 'belum' ? appTabActiveClass : appTabIdleClass
            }`}
          >
            Belum{' '}
            <span className={`tabular-nums ${presensiTab === 'belum' ? 'text-amber-600' : 'text-slate-400'}`}>
              {belumDiabsen.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPresensiTab('sudah')}
            className={`flex-1 py-2 px-2 rounded-sm text-[11px] font-bold transition-all active:scale-[0.98] ${
              presensiTab === 'sudah' ? appTabActiveClass : appTabIdleClass
            }`}
          >
            Sudah{' '}
            <span className={`tabular-nums ${presensiTab === 'sudah' ? 'text-emerald-600' : 'text-slate-400'}`}>
              {sudahDicatat.length}
            </span>
          </button>
        </div>
        )}

        {presensiTab === 'belum' && activeKegiatan && belumDiabsen.length > 0 && (
          <button
            type="button"
            onClick={handleBulkAllPresent}
            disabled={addAbsenMutation.isPending || !canRecordAbsensi}
            className="w-full flex items-center justify-center gap-1.5 rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2.5 text-[11px] font-bold active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" />
            Tandai semua hadir ({belumDiabsen.length} santri)
          </button>
        )}

        {visibleSantri.length === 0 ? (
          <EmptyState icon={Users} title="Tidak ada santri di filter ini" variant="minimal" />
        ) : dayAbsensiLoading ? (
          <div className={cn(appCardClass, 'overflow-hidden')}>
            <AppLoadingIndicator message="Memuat absensi…" />
          </div>
        ) : presensiTab === 'belum' && closedAbsensiEmpty ? (
          <div className="space-y-2">
            <EmptyState
              icon={Clock}
              title={closedAbsensiEmpty.title}
              description={closedAbsensiEmpty.description}
              variant="inline"
            />
            {firstOpenKegiatanNama &&
            firstOpenKegiatanNama !== activeKegiatan &&
            windowByKegiatan.get(firstOpenKegiatanNama)?.enabled ? (
              <button
                type="button"
                onClick={() => {
                  setActiveKegiatan(firstOpenKegiatanNama);
                  setPresensiTab('belum');
                }}
                className="w-full text-center text-[11px] font-bold text-emerald-700 dark:text-emerald-400 py-2"
              >
                Buka kegiatan: {firstOpenKegiatanNama}
              </button>
            ) : null}
          </div>
        ) : listForTab.length === 0 ? (
          <EmptyState
            icon={presensiTab === 'belum' ? CheckCircle2 : Undo2}
            title={presensiTab === 'belum' ? 'Semua sudah tercatat' : 'Belum ada catatan'}
            variant="minimal"
          />
        ) : (
          <div className="space-y-1.5">
            {listForTab.map((santri: { id: string; nama: string; kelas: string; kamar?: string }) => {
              const entry = getRecordedEntry(santri.id);
              const lockedIzin = isLockedIzinAbsensi(santri.id);
              const recorded = entry?.status ?? (lockedIzin ? 'Izin' : undefined);
              return (
                <div
                  key={santri.id}
                  className={cn(appCardClass, 'px-2.5 py-2 flex items-center justify-between gap-2')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 truncate leading-tight">{santri.nama}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {santri.kelas} · {santri.kamar || '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {presensiTab === 'belum' ? (
                      ATTENDANCE_STATUSES.map((st) => (
                        <button
                          key={st.code}
                          type="button"
                          title={
                            !canRecordAbsensi
                              ? activeAbsensiWindow?.hint ?? 'Di luar rentang absensi'
                              : st.status
                          }
                          disabled={addAbsenMutation.isPending || !canRecordAbsensi}
                          onClick={() => recordAttendance(santri.id, st.status)}
                          className={cn(
                            'w-6 h-6 min-w-6 rounded-sm text-[10px] font-bold leading-none transition-all border',
                            canRecordAbsensi
                              ? `active:scale-90 ${st.idleClass}`
                              : 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                          )}
                        >
                          {st.code}
                        </button>
                      ))
                    ) : (
                      <>
                        {recorded && (
                          <span
                            className={`w-6 h-6 min-w-6 rounded-sm flex items-center justify-center text-[10px] font-bold leading-none border ${
                              ATTENDANCE_STATUSES.find((s) => s.status === recorded)?.activeClass ??
                              'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                            title={recorded}
                          >
                            {statusCode(recorded)}
                          </span>
                        )}
                        {entry && !lockedIzin ? (
                          <button
                            type="button"
                            title="Batalkan"
                            disabled={rollbackAbsenMutation.isPending}
                            onClick={() => rollbackAbsenMutation.mutate(entry.id)}
                            className="w-6 h-6 min-w-6 flex items-center justify-center rounded-sm border border-rose-200 bg-rose-50 text-rose-700 active:scale-95 transition-all"
                          >
                            <Undo2 className="w-3 h-3" />
                          </button>
                        ) : lockedIzin ? (
                          <span
                            className="text-[9px] font-bold text-amber-700 px-1"
                            title="Dari data Izin Keluar"
                          >
                            Izin
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </PageWithPullRefresh>
  );
}
