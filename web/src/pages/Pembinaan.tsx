import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyLoading, useReloadKeyReady } from '@/hooks/use-reload-key';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { useLocation, useNavigate } from 'react-router';
import {
  BedDouble,
  Filter,
  GraduationCap,
  ShieldAlert,
  ClockAlert,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
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
  appTextareaClass,
} from '@/lib/form-styles';
import {
  appCardClass,
  appChipInactiveClass,
  appListCardButtonClass,
  appSectionTitleClass,
} from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { HeaderAddButton } from '@/components/header-action-button';
import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { getPelanggaranTier } from '@/lib/app-settings';
import {
  getPembinaanBadgeStyle,
  groupPembinaanBySantri,
  pembinaanDetailPath,
  PEMBINAAN_PAGE_SIZE,
  type PembinaanRow,
  type SantriPembinaanGroup,
} from '@/lib/pembinaan-group';
import { withBackTo } from '@/lib/app-navigation';

export default function Pembinaan() {
  const location = useLocation();
  const isPembinaanScreen = location.pathname === '/laporan/pembinaan';
  const reload = useAppReload();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSantriPickerOpen, setIsSantriPickerOpen] = useState(false);
  const [selectedSantriIds, setSelectedSantriIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedKelas, setSelectedKelas] = useState<string[]>([]);
  const [selectedKamar, setSelectedKamar] = useState<string[]>([]);
  const [draftKelas, setDraftKelas] = useState<string[]>([]);
  const [draftKamar, setDraftKamar] = useState<string[]>([]);

  const settings = useAppStore((s) => s.settings);
  const pembinaanReady = useReloadKeyReady('pembinaan');
  const pembinaanLoading = useReloadKeyLoading('pembinaan');
  const pembinaanList = useAppStore((s) => s.pembinaan);
  const santriList = useAppStore((s) => s.santri);

  const addPembinaanMutation = useMutation({
    mutationFn: async (payload: { santri_ids: string[] } & Record<string, unknown>) => {
      const { santri_ids, ...rest } = payload;
      let last: unknown = null;
      for (const santriId of santri_ids) {
        const res = await fetch('/api/pembinaan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...rest, santri_id: santriId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error || 'Gagal menyimpan catatan');
        last = data;
      }
      return last;
    },
    onSuccess: (_data, payload) => {
      const total = payload.santri_ids.length;
      toast.success(
        total > 1
          ? `Catatan pembinaan tersimpan untuk ${total} santri`
          : 'Catatan pembinaan berhasil disimpan'
      );
      void reload(['pembinaan', 'santri']);
      setIsAddModalOpen(false);
      setIsSantriPickerOpen(false);
      setSelectedSantriIds([]);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan catatan'),
  });

  const santriPickerOptions = useMemo(
    () =>
      (santriList as { id: string; nama: string; kamar?: string; kelas?: string }[]).map((s) => ({
        value: s.id,
        label: s.nama,
        sublabel: [s.kelas, s.kamar ? `Kamar ${s.kamar}` : null].filter(Boolean).join(' · ') || undefined,
      })),
    [santriList]
  );

  const selectedSantriLabel = useMemo(() => {
    if (!selectedSantriIds.length) return '';
    const names = (santriList as { id: string; nama: string; kamar?: string }[])
      .filter((s) => selectedSantriIds.includes(s.id))
      .map((s) => s.nama);
    return names.join(', ');
  }, [selectedSantriIds, santriList]);

  const toggleSantriSelection = useCallback((id: string) => {
    if (!id) return;
    setSelectedSantriIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSantriIds.length) {
      toast.error('Pilih santri terlebih dahulu');
      return;
    }
    const formData = new FormData(e.currentTarget);
    addPembinaanMutation.mutate({
      santri_ids: selectedSantriIds,
      jenis: formData.get('jenis'),
      keterangan: formData.get('keterangan'),
      tanggal: formData.get('tanggal'),
      tindak_lanjut: formData.get('tindak_lanjut')
    });
  };

  const santriById = useMemo(() => {
    const map = new Map<
      string,
      { nama: string; kelas: string; kamar: string }
    >();
    for (const s of santriList as { id: string; nama?: string; kelas?: string; kamar?: string }[]) {
      map.set(s.id, {
        nama: s.nama || '',
        kelas: s.kelas || '',
        kamar: s.kamar || '',
      });
    }
    return map;
  }, [santriList]);

  const allGrouped = useMemo(
    () => groupPembinaanBySantri(pembinaanList as PembinaanRow[]),
    [pembinaanList]
  );

  const groupedBySantri = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allGrouped.filter((group: SantriPembinaanGroup) => {
      const meta = santriById.get(group.santriId);
      const nama = meta?.nama || group.santriNama;
      const kelas = meta?.kelas || '';
      const kamar = meta?.kamar || group.santriKamar;

      if (q) {
        const match =
          nama.toLowerCase().includes(q) ||
          kelas.toLowerCase().includes(q) ||
          kamar.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (selectedKelas.length > 0 && !selectedKelas.includes(kelas)) return false;
      if (selectedKamar.length > 0 && !selectedKamar.includes(kamar)) return false;
      return true;
    });
  }, [allGrouped, santriById, searchQuery, selectedKamar, selectedKelas]);

  const kamarOptions = useMemo(() => {
    const fromSantri = new Set(
      (santriList as { kamar?: string }[])
        .map((s) => s.kamar)
        .filter((k): k is string => Boolean(k && k.trim()))
    );
    for (const g of allGrouped) {
      if (g.santriKamar && g.santriKamar !== '-') fromSantri.add(g.santriKamar);
    }
    return Array.from(fromSantri).sort((a, b) => a.localeCompare(b, 'id'));
  }, [allGrouped, santriList]);

  const kelasOptions = useMemo(() => {
    const fromSantri = new Set(
      (santriList as { kelas?: string }[])
        .map((s) => s.kelas)
        .filter((k): k is string => Boolean(k && k.trim()))
    );
    return Array.from(fromSantri).sort((a, b) => a.localeCompare(b, 'id'));
  }, [santriList]);

  const hasActiveFilter = selectedKelas.length > 0 || selectedKamar.length > 0;

  const toggleDraft = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const openFilterDrawer = () => {
    setDraftKelas(selectedKelas);
    setDraftKamar(selectedKamar);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    setSelectedKelas(draftKelas);
    setSelectedKamar(draftKamar);
    setFilterOpen(false);
  };

  const resetFilters = () => {
    setDraftKelas([]);
    setDraftKamar([]);
    setSelectedKelas([]);
    setSelectedKamar([]);
    setFilterOpen(false);
  };

  const totalPages = Math.max(1, Math.ceil(groupedBySantri.length / PEMBINAAN_PAGE_SIZE));

  const pagedGroups = useMemo(() => {
    const start = page * PEMBINAAN_PAGE_SIZE;
    return groupedBySantri.slice(start, start + PEMBINAAN_PAGE_SIZE);
  }, [groupedBySantri, page]);

  const santriPelanggaranCount = useCallback(
    (santriId: string) => {
      const row = (santriList as { id: string; jumlah_pelanggaran?: number }[]).find(
        (s) => s.id === santriId
      );
      return Number(row?.jumlah_pelanggaran) || 0;
    },
    [santriList]
  );

  useEffect(() => {
    setPage(0);
  }, [searchQuery, selectedKamar, selectedKelas]);

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const openAddModal = useCallback(() => setIsAddModalOpen(true), []);

  const closeAddModal = useCallback(() => {
    setIsAddModalOpen(false);
    setIsSantriPickerOpen(false);
    setSelectedSantriIds([]);
  }, []);

  const headerAddAction = useMemo(
    () => <HeaderAddButton onClick={openAddModal} label="Catat pelanggaran / teguran" />,
    [openAddModal]
  );

  useScreenHeaderActions(isPembinaanScreen ? headerAddAction : null, [isPembinaanScreen, headerAddAction]);

  return (
    <PageWithPullRefresh
      keys={['pembinaan', 'santri', 'kamar', 'kelas', 'settings']}
      className="space-y-4"
    >
      {/* Top Segmented Switch for Izin & BK */}
      <div className="flex items-center p-1 bg-slate-200/80 rounded-sm">
        <button
          type="button"
          onClick={() => navigate('/laporan/izin')}
          className="flex-1 py-2 text-xs font-semibold rounded-sm text-slate-600 hover:text-slate-900 flex items-center justify-center gap-1.5 transition-all"
        >
          <ClockAlert className="w-3.5 h-3.5 text-slate-400" />
          <span>Izin Keluar</span>
        </button>
        <button
          type="button"
          className="flex-1 py-2 text-xs font-bold rounded-sm bg-card text-card-foreground border border-border shadow-xs flex items-center justify-center gap-1.5 transition-all"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
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

      <AppModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter lanjutan"
        description="Pilih satu atau lebih kelas dan kamar (kosong = semua)"
      >
        <div className="space-y-5 text-sm -mx-1">
          <div className="space-y-2">
            <p className={appSectionTitleClass}>Kelas</p>
            {kelasOptions.length === 0 ? (
              <EmptyState icon={GraduationCap} title="Belum ada data kelas" variant="minimal" />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {kelasOptions.map((kelas) => {
                  const active = draftKelas.includes(kelas);
                  return (
                    <button
                      key={kelas}
                      type="button"
                      onClick={() => setDraftKelas((prev) => toggleDraft(prev, kelas))}
                      className={cn(
                        'px-3 py-1.5 rounded-sm text-xs font-bold border transition-all',
                        active
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                          : cn(appChipInactiveClass, 'text-slate-600')
                      )}
                    >
                      {kelas}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className={appSectionTitleClass}>Kamar</p>
            {kamarOptions.length === 0 ? (
              <EmptyState icon={BedDouble} title="Belum ada data kamar" variant="minimal" />
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-0.5">
                {kamarOptions.map((kamar) => {
                  const active = draftKamar.includes(kamar);
                  return (
                    <button
                      key={kamar}
                      type="button"
                      onClick={() => setDraftKamar((prev) => toggleDraft(prev, kamar))}
                      className={cn(
                        'px-3 py-1.5 rounded-sm text-xs font-bold border transition-all text-left',
                        active
                          ? 'bg-emerald-800 text-white border-emerald-800'
                          : cn(appChipInactiveClass, 'text-slate-600')
                      )}
                    >
                      {kamar}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 text-xs" onClick={resetFilters}>
              Reset filter
            </Button>
            <Button type="button" className="flex-1 text-xs" onClick={applyFilters}>
              Terapkan
            </Button>
          </div>
        </div>
      </AppModal>

      {/* Pembinaan Card Feed */}
      <div className="space-y-3">
        {pembinaanLoading && !pembinaanReady ? (
          <ListSkeleton rows={6} />
        ) : groupedBySantri.length === 0 ? (
          <EmptyState
            icon={allGrouped.length === 0 ? ShieldAlert : Filter}
            title={allGrouped.length === 0 ? 'Belum ada catatan' : 'Tidak ada hasil filter'}
            description={
              allGrouped.length === 0
                ? 'Ketuk tombol + di header untuk mencatat pelanggaran atau teguran.'
                : 'Ubah pencarian atau filter kelas/kamar.'
            }
          />
        ) : (
          <>
            <p className="text-[11px] text-slate-500 px-0.5">
              {groupedBySantri.length} santri · ketuk kartu untuk lihat semua catatan
            </p>
            {pagedGroups.map((group) => {
              const totalCatatan = group.records.length;
              const poinAkumulasi = santriPelanggaranCount(group.santriId);
              const tier = getPelanggaranTier(poinAkumulasi, settings);
              const latest = group.records[0];
              const meta = santriById.get(group.santriId);
              const kelasLabel = meta?.kelas || '-';

              return (
                <button
                  key={group.santriId}
                  type="button"
                  onClick={() =>
                    navigate(pembinaanDetailPath(group.santriId), withBackTo(location.pathname))
                  }
                  className={appListCardButtonClass}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                        {group.santriNama}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        Kelas {kelasLabel}
                        {group.santriKamar && group.santriKamar !== '-'
                          ? ` · ${group.santriKamar}`
                          : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                      {totalCatatan} catatan
                    </span>
                    {group.countPelanggaran > 0 && (
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getPembinaanBadgeStyle('Pelanggaran')}`}
                      >
                        {group.countPelanggaran} pelanggaran
                      </span>
                    )}
                    {group.countTeguran > 0 && (
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getPembinaanBadgeStyle('Teguran')}`}
                      >
                        {group.countTeguran} teguran
                      </span>
                    )}
                    {tier && poinAkumulasi > 0 && (
                      <span className="text-[10px] font-semibold text-amber-800">
                        Akumulasi: {poinAkumulasi}x{tier.level > 0 ? ` · ${tier.label}` : ''}
                      </span>
                    )}
                  </div>

                  {latest && (
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      Terakhir{' '}
                      {new Date(latest.tanggal).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      : {latest.keterangan}
                    </p>
                  )}
                </button>
              );
            })}

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="text-xs gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Sebelumnya
                </Button>
                <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                  Halaman {page + 1} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  className="text-xs gap-1"
                >
                  Berikutnya
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <AppModal
        open={isAddModalOpen}
        onClose={closeAddModal}
        title="Catat Pelanggaran dan Teguran"
        description="Catat kejadian disiplin santri untuk arsip BK"
      >
            <form onSubmit={handleSubmit} className="space-y-3.5 -mx-1">
              <div className={appFormStack}>
                <label className={appLabelClass}>Pilih Santri *</label>
                <button
                  type="button"
                  onClick={() => setIsSantriPickerOpen(true)}
                  className={appPickerBtnClass}
                >
                  <span className={`truncate text-left ${selectedSantriLabel ? '' : 'text-slate-400'}`}>
                    {selectedSantriLabel || 'Pilih santri... (bisa lebih dari satu)'}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                </button>
              </div>

              <div className={appFormGrid2}>
                <div className={`${appFormStack} min-w-0`}>
                  <label className={appLabelClass}>Jenis Catatan *</label>
                  <select
                    name="jenis"
                    defaultValue="Pelanggaran"
                    required
                    className={appSelectClass}
                  >
                    <option value="Pelanggaran">Pelanggaran</option>
                    <option value="Teguran">Teguran</option>
                  </select>
                </div>

                <div className={`${appFormStack} min-w-0`}>
                  <label className={appLabelClass}>Tanggal Kejadian *</label>
                  <input
                    name="tanggal"
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                    className={appFieldClass}
                  />
                </div>
              </div>

              <div className={appFormStack}>
                <label className={appLabelClass}>Kronologi / Uraian Kejadian *</label>
                <textarea
                  name="keterangan"
                  rows={3}
                  required
                  placeholder="Ceritakan kejadian pelanggaran atau teguran secara rinci..."
                  className={appTextareaClass}
                />
              </div>

              <div className={appFormStack}>
                <label className={appLabelClass}>Tindak Lanjut & Arahan Pengurus</label>
                <textarea
                  name="tindak_lanjut"
                  rows={2}
                  placeholder="Arahan nasihat, hukuman mendidik, atau tindak lanjut pengurus..."
                  className={appTextareaClass}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={addPembinaanMutation.isPending || !selectedSantriIds.length}
                  className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-sm font-bold text-xs shadow-md shadow-emerald-700/20 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {addPembinaanMutation.isPending
                    ? 'Menyimpan...'
                    : selectedSantriIds.length > 1
                      ? `Simpan catatan (${selectedSantriIds.length} santri)`
                      : 'Simpan catatan'}
                </button>
              </div>
            </form>
      </AppModal>

      <BottomPicker
        open={isSantriPickerOpen}
        onClose={() => setIsSantriPickerOpen(false)}
        title="Pilih Santri"
        description="Bisa pilih lebih dari satu — ketuk nama untuk menandai"
        searchPlaceholder="Cari santri..."
        options={santriPickerOptions}
        value=""
        multi
        values={selectedSantriIds}
        onSelect={toggleSantriSelection}
      />

    </PageWithPullRefresh>
  );
}
