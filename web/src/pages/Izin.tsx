import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { useLocation, useNavigate } from 'react-router';
import {
  ClockAlert,
  AlertTriangle,
  ChevronDown,
  Filter,
  ShieldAlert,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { KelasKamarFilterSheet } from '@/components/kelas-kamar-filter-sheet';
import {
  IZIN_BATAS_BELUM_PASTI,
  batasKembaliLocalFromKeluar,
  collectSantriIdsSedangIzin,
  datetimeLocalToIso,
  parseDatetimeLocal,
  filterIzinGroupsByStatus,
  groupIzinBySantri,
  isIzinBatasBelumPasti,
  isIzinTerlambat,
  izinDetailPath,
  toDatetimeLocalValue,
  type IzinDurasiPreset,
  type IzinRow,
} from '@/lib/izin-group';
import { withBackTo } from '@/lib/app-navigation';
import { BottomPicker } from '@/components/ui/bottom-picker';
import { EmptyState } from '@/components/ui/empty-state';
import {
  appFieldClass,
  appFieldThemed,
  appFormGrid2,
  appFormStack,
  appLabelClass,
  appPickerBtnClass,
  appSelectClass,
} from '@/lib/form-styles';
import {
  appCardClass,
  appChipInactiveClass,
  appListCardButtonClass,
} from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import {
  kamarOptionsFromSantri,
  kelasOptionsFromSantri,
  matchesSantriSearchAndRoomFilters,
} from '@/lib/santri-multi-filter';
import { useScreenAddAction } from '@/lib/screen-header-actions';
import { ScrollNavButtons } from '@/components/scroll-nav-buttons';
import { AppModal, AppModalFooter } from '@/components/ui/app-modal';
import { toast } from '@/lib/toast';

const IZIN_ALASAN_PRESETS = [
  'Izin keluar saja',
  'Sakit / Berobat',
  'Acara keluarga',
  'Pulang ke rumah',
  'Lomba / Kejuaraan',
  'Urusan sekolah',
  'Lainnya',
] as const;

const DEFAULT_IZIN_ALASAN = IZIN_ALASAN_PRESETS[0];

const IZIN_DURASI_JAM: { id: IzinDurasiPreset; label: string }[] = [
  { id: '30menit', label: '30 menit' },
  { id: '1jam', label: '1 jam' },
  { id: '2jam', label: '2 jam' },
  { id: '3jam', label: '3 jam' },
  { id: '6jam', label: '6 jam' },
  { id: 'custom', label: 'Atur sendiri' },
];

const IZIN_DURASI_HARI: { id: IzinDurasiPreset; label: string }[] = [
  { id: '1hari', label: '1 hari' },
  { id: '2hari', label: '2 hari' },
  { id: '1minggu', label: '1 minggu' },
  { id: '1bulan', label: '1 bulan' },
  { id: 'belum_pasti', label: 'Belum pasti' },
  { id: 'custom', label: 'Atur sendiri' },
];

function defaultKeluarLocal(): string {
  return toDatetimeLocalValue(new Date());
}

export default function Izin() {
  const location = useLocation();
  const isIzinScreen = location.pathname === '/laporan/izin';
  const reload = useAppReload();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const statusScrollRef = useRef<HTMLDivElement>(null);
  const [isSantriPickerOpen, setIsSantriPickerOpen] = useState(false);
  const [selectedSantriId, setSelectedSantriId] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Semua' | 'Belum' | 'Sudah'>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedKelas, setSelectedKelas] = useState<string[]>([]);
  const [selectedKamar, setSelectedKamar] = useState<string[]>([]);
  const [alasanJenis, setAlasanJenis] = useState<string>(DEFAULT_IZIN_ALASAN);
  const [alasanLainnya, setAlasanLainnya] = useState('');
  const [tanggalKeluar, setTanggalKeluar] = useState(defaultKeluarLocal);
  const [durasiPreset, setDurasiPreset] = useState<IzinDurasiPreset>('belum_pasti');
  const [batasKembaliLocal, setBatasKembaliLocal] = useState(() =>
    batasKembaliLocalFromKeluar(defaultKeluarLocal(), '1hari')
  );

  const izinReady = useReloadKeyReady('izin');
  const izinList = useAppStore((s) => s.izin);
  const santriList = useAppStore((s) => s.santri);

  const resetIzinFormDates = useCallback((alasan = DEFAULT_IZIN_ALASAN) => {
    const keluar = defaultKeluarLocal();
    setTanggalKeluar(keluar);
    if (alasan === 'Sakit / Berobat') {
      setDurasiPreset('belum_pasti');
      return;
    }
    if (alasan === 'Izin keluar saja') {
      setDurasiPreset('1jam');
      setBatasKembaliLocal(batasKembaliLocalFromKeluar(keluar, '1jam'));
      return;
    }
    setDurasiPreset('1hari');
    setBatasKembaliLocal(batasKembaliLocalFromKeluar(keluar, '1hari'));
  }, []);

  useEffect(() => {
    void reload(['izin', 'santri']);
  }, [reload]);

  const addIzinMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch('/api/izin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Gagal menyimpan izin');
      return data;
    },
    onSuccess: () => {
      toast.success('Data izin berhasil disimpan');
      void reload(['izin', 'dashboard']);
      setIsAddModalOpen(false);
      setIsSantriPickerOpen(false);
      setSelectedSantriId('');
      setAlasanJenis(DEFAULT_IZIN_ALASAN);
      setAlasanLainnya('');
      resetIzinFormDates();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan izin'),
  });

  const santriSedangIzinIds = useMemo(
    () => collectSantriIdsSedangIzin(izinList as IzinRow[]),
    [izinList]
  );

  const santriPickerOptions = useMemo(
    () =>
      (santriList as { id: string; nama: string; kamar?: string; kelas?: string }[])
        .filter((s) => !santriSedangIzinIds.has(s.id))
        .map((s) => ({
          value: s.id,
          label: s.nama,
          sublabel: [s.kelas, s.kamar ? `Kamar ${s.kamar}` : null].filter(Boolean).join(' · ') || undefined,
        })),
    [santriList, santriSedangIzinIds]
  );

  const selectedSantri = (santriList as { id: string; nama: string; kamar?: string }[]).find(
    (s) => s.id === selectedSantriId
  );

  useEffect(() => {
    if (!isAddModalOpen) return;
    if (selectedSantriId && !santriSedangIzinIds.has(selectedSantriId)) return;
    const first = santriPickerOptions[0];
    setSelectedSantriId(first?.value ?? '');
  }, [isAddModalOpen, santriPickerOptions, selectedSantriId, santriSedangIzinIds]);

  useEffect(() => {
    if (durasiPreset === 'custom' || durasiPreset === 'belum_pasti') return;
    setBatasKembaliLocal(batasKembaliLocalFromKeluar(tanggalKeluar, durasiPreset));
  }, [tanggalKeluar, durasiPreset]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSantriId) {
      toast.error('Pilih santri terlebih dahulu');
      return;
    }
    if (santriSedangIzinIds.has(selectedSantriId)) {
      toast.error('Santri masih sedang izin. Tandai sudah kembali dulu.');
      return;
    }
    let alasan: string;
    if (alasanJenis === 'Lainnya') {
      const custom = alasanLainnya.trim();
      if (!custom) {
        toast.error('Isi alasan lainnya');
        return;
      }
      alasan = custom;
    } else {
      alasan = alasanJenis;
    }
    const formData = new FormData(e.currentTarget);
    const batas_kembali =
      durasiPreset === 'belum_pasti'
        ? IZIN_BATAS_BELUM_PASTI
        : datetimeLocalToIso(batasKembaliLocal);
    if (durasiPreset === 'custom' && !batasKembaliLocal) {
      toast.error('Isi batas kembali');
      return;
    }
    if (durasiPreset !== 'belum_pasti' && parseDatetimeLocal(batasKembaliLocal) <= parseDatetimeLocal(tanggalKeluar)) {
      toast.error('Batas kembali harus setelah waktu keluar');
      return;
    }
    addIzinMutation.mutate({
      santri_id: selectedSantriId,
      alasan,
      tanggal_keluar: datetimeLocalToIso(tanggalKeluar),
      batas_kembali,
      penjemput: formData.get('penjemput') || 'Orang Tua',
    });
  };

  const santriById = useMemo(() => {
    const map = new Map<string, { nama: string; kelas: string; kamar: string }>();
    for (const s of santriList as {
      id: string;
      nama?: string;
      kelas?: string;
      kamar?: string;
    }[]) {
      map.set(s.id, {
        nama: s.nama || '',
        kelas: s.kelas || '',
        kamar: s.kamar || '',
      });
    }
    return map;
  }, [santriList]);

  const kelasOptions = useMemo(() => kelasOptionsFromSantri(santriList as { kelas?: string }[]), [santriList]);

  const kamarOptions = useMemo(() => {
    const extra = (izinList as { santri_kamar?: string }[])
      .map((i) => i.santri_kamar)
      .filter((k): k is string => Boolean(k));
    return kamarOptionsFromSantri(santriList as { kamar?: string }[], extra);
  }, [izinList, santriList]);

  const hasActiveFilter = selectedKelas.length > 0 || selectedKamar.length > 0;

  const openFilterDrawer = () => setFilterOpen(true);

  const groupedIzin = useMemo(() => {
    const all = groupIzinBySantri(izinList as IzinRow[]);
    const byStatus = filterIzinGroupsByStatus(all, filterStatus);
    return byStatus.filter((group) => {
      const meta = santriById.get(group.santriId);
      const nama = meta?.nama || group.santriNama;
      const kelas = meta?.kelas || '';
      const kamar = meta?.kamar || group.santriKamar || '';
      return matchesSantriSearchAndRoomFilters(
        { nama, kelas, kamar },
        searchQuery,
        selectedKelas,
        selectedKamar
      );
    });
  }, [filterStatus, izinList, santriById, searchQuery, selectedKamar, selectedKelas]);

  const totalSedangIzin = (izinList as unknown as { status_kembali?: string }[]).filter(
    (i) => i.status_kembali === 'Belum'
  ).length;

  const openAddModal = useCallback(() => {
    resetIzinFormDates(DEFAULT_IZIN_ALASAN);
    setIsAddModalOpen(true);
  }, [resetIzinFormDates]);

  const closeAddModal = useCallback(() => {
    setIsAddModalOpen(false);
    setIsSantriPickerOpen(false);
    setSelectedSantriId('');
    setAlasanJenis(DEFAULT_IZIN_ALASAN);
    setAlasanLainnya('');
    resetIzinFormDates(DEFAULT_IZIN_ALASAN);
  }, [resetIzinFormDates]);

  const headerAddAction = useMemo(
    () => ({ onClick: openAddModal, label: 'Tambah izin' }),
    [openAddModal]
  );

  useScreenAddAction(isIzinScreen ? headerAddAction : null, [isIzinScreen, headerAddAction]);

  return (
    <>
    <PageWithPullRefresh keys={['izin', 'santri', 'kelas', 'kamar']} className="space-y-4">
      {/* Top Segmented Switch for Izin & BK */}
      <div className="flex items-center p-1 bg-slate-200/80 rounded-sm">
        <button
          type="button"
          className="flex-1 py-2 text-xs font-bold rounded-sm bg-card text-card-foreground border border-border shadow-xs flex items-center justify-center gap-1.5 transition-all"
        >
          <ClockAlert className="w-3.5 h-3.5 text-amber-600" />
          <span>Izin Keluar ({totalSedangIzin})</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/laporan/pembinaan')}
          className="flex-1 py-2 text-xs font-semibold rounded-sm text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 transition-all"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
          <span>Pelanggaran & Teguran</span>
        </button>
      </div>

      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1 min-w-0">
          <Search
            className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama santri..."
            className={`${appFieldThemed(theme)} w-full pl-9 pr-8 shadow-xs text-xs ${
              theme === 'light' ? 'bg-white border-slate-200/90' : ''
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 ${theme === 'dark' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={openFilterDrawer}
          aria-label="Filter lanjutan kelas dan kamar"
          className={cn(
            'relative shrink-0 px-3 rounded-sm border shadow-xs flex items-center justify-center gap-1.5 text-xs font-bold transition-colors',
            hasActiveFilter
              ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : cn(appChipInactiveClass, 'text-slate-700 dark:text-slate-200')
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filter</span>
          {hasActiveFilter ? (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-white" />
          ) : null}
        </button>
      </div>

      {hasActiveFilter && (
        <p className="text-[11px] text-slate-500 px-0.5 leading-relaxed">
          Filter aktif:
          {selectedKelas.length > 0 ? ` ${selectedKelas.length} kelas` : ''}
          {selectedKelas.length > 0 && selectedKamar.length > 0 ? ' ·' : ''}
          {selectedKamar.length > 0 ? ` ${selectedKamar.length} kamar` : ''}
        </p>
      )}

      <div className="flex items-center gap-1">
      <div ref={statusScrollRef} className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {(['Semua', 'Belum', 'Sudah'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setFilterStatus(st)}
            className={cn(
              'whitespace-nowrap px-3.5 py-1.5 rounded-sm text-xs font-bold transition-all shrink-0 active:scale-95',
              filterStatus === st
                ? 'bg-slate-900 text-white shadow-xs dark:bg-slate-700 dark:text-white'
                : cn(appChipInactiveClass, 'text-slate-600')
            )}
          >
            {st === 'Semua' ? 'Semua Riwayat' : st === 'Belum' ? 'Sedang Izin' : 'Sudah Kembali'}
          </button>
        ))}
      </div>
      <ScrollNavButtons target={statusScrollRef} />
      </div>

      <KelasKamarFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        kelasOptions={kelasOptions}
        kamarOptions={kamarOptions}
        selectedKelas={selectedKelas}
        selectedKamar={selectedKamar}
        onApply={(kelas, kamar) => {
          setSelectedKelas(kelas);
          setSelectedKamar(kamar);
          setFilterOpen(false);
        }}
        onReset={() => {
          setSelectedKelas([]);
          setSelectedKamar([]);
          setFilterOpen(false);
        }}
      />

      {/* Izin Card Feed */}
      <div className="space-y-3">
        {!izinReady ? (
          <ListSkeleton rows={6} />
        ) : groupedIzin.length === 0 ? (
          <EmptyState
            icon={izinList.length === 0 ? ClockAlert : Filter}
            title={izinList.length === 0 ? 'Tidak ada data izin' : 'Tidak ada hasil filter'}
            description={
              izinList.length === 0
                ? 'Ketuk tombol + di header untuk membuat surat izin baru.'
                : 'Ubah pencarian, status, atau filter kelas/kamar.'
            }
          />
        ) : (
          <>
            <p className="text-[11px] text-slate-500 px-0.5">
              {groupedIzin.length} santri · ketuk kartu untuk lihat riwayat izin
            </p>
            {groupedIzin.map((group) => {
              const meta = santriById.get(group.santriId);
              const kelasLabel = meta?.kelas;
              const kamarLabel = meta?.kamar || group.santriKamar;
              const latest = group.records[0];
              const active = group.activeIzin;
              const isLate = active ? isIzinTerlambat(active) : false;

              return (
                <button
                  key={group.santriId}
                  type="button"
                  onClick={() =>
                    navigate(izinDetailPath(group.santriId), withBackTo(location.pathname))
                  }
                  className={cn(
                    appListCardButtonClass,
                    isLate && 'border-rose-300 bg-rose-50/20 dark:bg-rose-950/35 dark:border-rose-800/60'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                        {meta?.nama || group.santriNama}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {kelasLabel ? `Kelas ${kelasLabel}` : ''}
                        {kelasLabel && kamarLabel ? ' · ' : ''}
                        {kamarLabel ? kamarLabel : ''}
                      </p>
                      {latest ? (
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          Terakhir: <strong className="text-slate-800">{latest.alasan}</strong>
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                      {group.records.length} riwayat
                    </span>
                    {active ? (
                      isIzinBatasBelumPasti(active.batas_kembali) ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                          Sedang izin · belum pasti
                        </span>
                      ) : isLate ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Sedang izin · terlambat
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Sedang izin
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Di asrama
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </PageWithPullRefresh>

      <AppModal
        open={isAddModalOpen}
        onClose={closeAddModal}
        title="Buat Izin Keluar Santri"
        description="Catat izin keluar komplek atau kepulangan"
        footer={
          <AppModalFooter>
            <button
              type="submit"
              form="izin-add-form"
              disabled={
                addIzinMutation.isPending ||
                !selectedSantriId ||
                santriPickerOptions.length === 0
              }
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-sm font-bold text-xs shadow-md shadow-emerald-700/20 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {addIzinMutation.isPending ? 'Menyimpan...' : 'Simpan Surat Izin'}
            </button>
          </AppModalFooter>
        }
      >
            <form id="izin-add-form" onSubmit={handleSubmit} className="space-y-3.5 -mx-1">
              {santriPickerOptions.length === 0 ? (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                  Semua santri sedang dalam status izin. Tandai yang sudah kembali dulu sebelum membuat
                  izin baru.
                </p>
              ) : null}
              <div className={appFormStack}>
                <label className={appLabelClass}>Pilih Santri *</label>
                <button
                  type="button"
                  onClick={() => setIsSantriPickerOpen(true)}
                  disabled={santriPickerOptions.length === 0}
                  className={`${appPickerBtnClass} disabled:opacity-50`}
                >
                  <span className={`truncate text-left ${selectedSantri ? '' : 'text-slate-400'}`}>
                    {selectedSantri
                      ? `${selectedSantri.nama}${selectedSantri.kamar ? ` (${selectedSantri.kamar})` : ''}`
                      : santriPickerOptions.length === 0
                        ? 'Tidak ada santri tersedia'
                        : 'Pilih santri...'}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                </button>
                <p className="text-[10px] text-slate-400">
                  Santri yang masih sedang izin tidak bisa dipilih sampai ditandai sudah kembali.
                </p>
              </div>

              <div className={appFormStack}>
                <label className={appLabelClass}>Alasan Izin *</label>
                <select
                  value={alasanJenis}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAlasanJenis(v);
                    if (v === 'Sakit / Berobat') {
                      setDurasiPreset('belum_pasti');
                    } else if (v === 'Izin keluar saja') {
                      setDurasiPreset('1jam');
                      setBatasKembaliLocal(
                        batasKembaliLocalFromKeluar(tanggalKeluar, '1jam')
                      );
                    } else if (durasiPreset === 'belum_pasti' || durasiPreset === '1jam') {
                      setDurasiPreset('1hari');
                      setBatasKembaliLocal(
                        batasKembaliLocalFromKeluar(tanggalKeluar, '1hari')
                      );
                    }
                  }}
                  required
                  className={appSelectClass}
                >
                  {IZIN_ALASAN_PRESETS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              {alasanJenis === 'Lainnya' ? (
                <div className={appFormStack}>
                  <label className={appLabelClass}>Jelaskan alasan *</label>
                  <input
                    value={alasanLainnya}
                    onChange={(e) => setAlasanLainnya(e.target.value)}
                    required
                    placeholder="Tulis alasan izin..."
                    className={appFieldClass}
                  />
                </div>
              ) : null}

              <div className={appFormStack}>
                <label className={appLabelClass}>Penjemput / Pendamping</label>
                <select name="penjemput" defaultValue="Orang Tua" className={appSelectClass}>
                  <option value="Orang Tua">Orang Tua</option>
                  <option value="Saudara">Saudara</option>
                  <option value="Teman">Teman</option>
                  <option value="Kerabat">Kerabat</option>
                  <option value="Mandiri">Mandiri</option>
                </select>
              </div>

              <div className={appFormStack}>
                <label className={appLabelClass}>Waktu Keluar *</label>
                <input
                  type="datetime-local"
                  value={tanggalKeluar}
                  onChange={(e) => setTanggalKeluar(e.target.value)}
                  required
                  className={appFieldClass}
                />
              </div>

              <div className={appFormStack}>
                <label className={appLabelClass}>
                  Estimasi kembali
                  {alasanJenis === 'Izin keluar saja' ? ' (jam)' : ''}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(alasanJenis === 'Izin keluar saja' ? IZIN_DURASI_JAM : IZIN_DURASI_HARI).map(
                    (item) => {
                      const active = durasiPreset === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setDurasiPreset(item.id)}
                          className={cn(
                            'px-2.5 py-1.5 rounded-sm text-[11px] font-bold border transition-all',
                            active
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : cn(appChipInactiveClass, 'text-slate-600')
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    }
                  )}
                </div>
                {durasiPreset === 'belum_pasti' ? (
                  <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-2.5 py-2 leading-relaxed">
                    Tanggal kembali belum ditetapkan (mis. menunggu sembuh). Santri tetap tercatat sedang izin
                    sampai ditandai sudah kembali.
                  </p>
                ) : durasiPreset === 'custom' ? (
                  <div className="min-w-0 pt-1">
                    <label className={appLabelClass}>Batas kembali (custom)</label>
                    <input
                      type="datetime-local"
                      value={batasKembaliLocal}
                      onChange={(e) => setBatasKembaliLocal(e.target.value)}
                      required
                      className={appFieldClass}
                    />
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    Batas kembali:{' '}
                    <strong className="text-slate-700">
                      {new Date(parseDatetimeLocal(batasKembaliLocal)).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </strong>
                  </p>
                )}
              </div>
            </form>
      </AppModal>

      <BottomPicker
        open={isSantriPickerOpen}
        onClose={() => setIsSantriPickerOpen(false)}
        title="Pilih Santri"
        description="Cari nama, kelas, atau kamar"
        searchPlaceholder="Cari santri..."
        options={santriPickerOptions}
        value={selectedSantriId}
        onSelect={setSelectedSantriId}
      />

    </>
  );
}
