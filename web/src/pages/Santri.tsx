import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useAppStore, useInitialAppLoading } from '@/store/app-store';
import { useAppReload } from '@/hooks/use-app-reload';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { 
  Search, 
  Phone, 
  MessageCircle, 
  Trash2,
  X,
  Edit2,
  Save,
  Crown,
  MoreVertical,
  ShieldAlert,
  ClockAlert,
  BedDouble,
  Banknote,
  User,
  Users,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { pembinaanDetailPath } from '@/lib/pembinaan-group';
import { izinDetailPath } from '@/lib/izin-group';
import { santriKamarRiwayatPath } from '@/lib/santri-kamar-riwayat';
import { santriTagihanPath } from '@/lib/santri-tunggakan';
import { withBackTo } from '@/lib/app-navigation';
import { santriDetailPath } from '@/lib/santri-detail';
import { AppModal, AppModalFooter } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BottomPicker } from '@/components/ui/bottom-picker';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { appFieldThemed } from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { SantriFormFields } from '@/components/santri-form-fields';
import { SantriAvatar } from '@/components/santri-avatar';
import { emptyWilayahForm, wilayahFromSantri } from '@/components/wilayah-asal-fields';
import { formatAsalWilayahShort } from '@/lib/wilayah-types';
import { useTheme } from '../lib/theme';
import { useScreenAddAction } from '@/lib/screen-header-actions';
import { ScrollNavButtons } from '@/components/scroll-nav-buttons';
import { toast } from '@/lib/toast';
import { fetchSantriPage } from '@/lib/santri-api';
import { getSessionUser, subscribeSessionUser } from '@/lib/app-auth';
import {
  autoJenisKelaminFromAsrama,
  resolveJenisAsramaAktif,
} from '@/lib/app-settings';

type SantriRow = {
  id: string;
  nama: string;
  kelas: string;
  kamar?: string;
  nomor_wali?: string;
  include_wa?: boolean;
  catatan?: string;
  catatan_medis?: string;
  foto?: string;
  jumlah_pelanggaran?: number;
  is_ketua_kamar?: number | boolean;
  asal_provinsi_nama?: string;
  asal_kota_nama?: string;
};

const emptyForm = {
  nama: '',
  kelas: '',
  kamar: '',
  nomor_wali: '',
  jenis_kelamin: '',
  include_wa: true,
  catatan: '',
  catatan_medis: '',
  foto: '',
};

export default function Santri() {
  const location = useLocation();
  const isSantriScreen = location.pathname === '/master/santri';
  const navigate = useNavigate();
  const reload = useAppReload();
  const { theme } = useTheme();
  const isLoading = useInitialAppLoading();
  const kamarList = useAppStore((s) => s.kamar) as { id: string; nama: string }[];
  const kelasList = useAppStore((s) => s.kelas) as { id: string; nama: string; tingkat?: string }[];
  const settings = useAppStore((s) => s.settings);
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  useEffect(() => subscribeSessionUser(() => setSessionUser(getSessionUser())), []);
  // Ikuti jenis asrama aktif (Aspura/Aspuri), bukan settings global.
  const jenisAsrama = resolveJenisAsramaAktif(settings, sessionUser?.activeAsramaId);
  const autoGender = autoJenisKelaminFromAsrama(jenisAsrama);

  const [showAddModal, setShowAddModal] = useState(false);
  const [optionPicker, setOptionPicker] = useState<'kelas' | 'kamar' | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editingSantri, setEditingSantri] = useState<any | null>(null);
  const [selectedSantriForContact, setSelectedSantriForContact] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKamarFilter, setSelectedKamarFilter] = useState('Semua');
  const [actionMenuSantri, setActionMenuSantri] = useState<SantriRow | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [wilayahForm, setWilayahForm] = useState(emptyWilayahForm);
  const [pageItems, setPageItems] = useState<SantriRow[]>([]);
  const [totalSantri, setTotalSantri] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const listRequestRef = useRef(0);
  const kamarFilterScrollRef = useRef<HTMLDivElement>(null);
  const confirmDialog = useConfirmDialog();

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      const reqId = ++listRequestRef.current;
      setListLoading(true);
      try {
        const res = await fetchSantriPage({
          page: pageNum,
          q: searchQuery,
          kamar: selectedKamarFilter,
        });
        if (reqId !== listRequestRef.current) return;
        setTotalSantri(res.total ?? 0);
        setListPage(res.page ?? pageNum);
        const rows = (res.items ?? []) as SantriRow[];
        setPageItems((prev) => (append ? [...prev, ...rows] : rows));
      } catch {
        if (reqId === listRequestRef.current) {
          toast.error('Gagal memuat daftar santri');
        }
      } finally {
        if (reqId === listRequestRef.current) setListLoading(false);
      }
    },
    [searchQuery, selectedKamarFilter]
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadPage(1, false);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQuery, selectedKamarFilter, loadPage]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { id?: string; body: Record<string, unknown> }) => {
      const { maybeCompressImageDataUrl } = await import('@/lib/image-compress');
      const foto = await maybeCompressImageDataUrl(
        typeof payload.body.foto === 'string' ? payload.body.foto : ''
      );
      const body = { ...payload.body, foto };
      if (payload.id) {
        const res = await fetch(`/api/santri/${payload.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { error?: string }).error || 'Gagal menyimpan');
        return data;
      }
      const res = await fetch('/api/santri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Gagal menyimpan');
      return data;
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.id ? 'Data santri berhasil diperbarui' : 'Santri berhasil ditambahkan'
      );
      void reload(['santri', 'kamar', 'dashboard']);
      void loadPage(1, false);
      setShowAddModal(false);
      setShowEditModal(false);
      setEditingSantri(null);
      setFormData(emptyForm);
      setWilayahForm(emptyWilayahForm());
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan data santri'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/santri/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Gagal menghapus santri');
      }
    },
    onSuccess: () => {
      toast.success('Santri dan semua data terkait berhasil dihapus');
      void reload([
        'santri',
        'kamar',
        'dashboard',
        'penjadwalan',
        'izin',
        'pembinaan',
        'absensi',
      ]);
      void loadPage(1, false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus santri'),
  });

  const handleTakePhoto = async (source: 'camera' | 'gallery') => {
    try {
      const { Camera: CapacitorCamera, CameraResultType, CameraSource } = await import(
        '@capacitor/camera'
      );
      const photo = await CapacitorCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        width: 1024,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });
      const { maybeCompressImageDataUrl } = await import('@/lib/image-compress');
      const foto = await maybeCompressImageDataUrl(photo.dataUrl || '');
      setFormData({ ...formData, foto });
    } catch (error) {
      console.error('Error taking photo:', error);
      // Ignore user cancellation
    }
  };

  const handleSave = () => {
    if (!formData.nama || !formData.kelas) {
      toast.error('Nama dan kelas harus diisi');
      return;
    }
    const resolvedGender = autoGender || formData.jenis_kelamin;
    if (!resolvedGender) {
      toast.error('Jenis kelamin wajib dipilih');
      return;
    }
    const body = {
      ...formData,
      ...wilayahForm,
      jenis_kelamin: resolvedGender,
      include_wa: formData.include_wa,
    };
    saveMutation.mutate(editingSantri ? { id: editingSantri.id, body } : { body });
  };

  const handleEdit = (santri: any) => {
    setEditingSantri(santri);
    setFormData({
      nama: santri.nama,
      kelas: santri.kelas,
      kamar: santri.kamar || '',
      nomor_wali: santri.nomor_wali || '',
      jenis_kelamin: santri.jenis_kelamin || autoGender,
      include_wa: santri.include_wa !== false,
      catatan: santri.catatan || '',
      catatan_medis: santri.catatan_medis || '',
      foto: santri.foto || '',
    });
    setWilayahForm(wilayahFromSantri(santri));
    setShowEditModal(true);
  };

  const requestDeleteSantri = (santri: SantriRow) => {
    confirmDialog.ask({
      message: `Hapus "${santri.nama}" secara permanen? Riwayat izin, absensi, catatan pelanggaran, penjadwalan, dan riwayat kamar santri ini ikut dihapus. Data kamar tetap ada; jika dia ketua, jabatan ketua dikosongkan.`,
      confirmLabel: 'Ya, Hapus',
      onConfirm: () =>
        new Promise<void>((resolve, reject) => {
          deleteMutation.mutate(santri.id, {
            onSuccess: () => resolve(),
            onError: () => {
              reject();
            },
          });
        }),
    });
  };

  const handleContactClick = (santri: SantriRow) => {
    if (!santri.nomor_wali) {
      toast.error('Nomor wali belum diisi');
      return;
    }

    if (santri.include_wa !== false) {
      setSelectedSantriForContact(santri);
      setShowContactModal(true);
    } else {
      // Direct call
      const cleanPhone = santri.nomor_wali.replace(/[^0-9]/g, '');
      window.location.href = `tel:${cleanPhone}`;
    }
  };

  const handleWhatsApp = (santri: any) => {
    const cleanPhone = santri.nomor_wali.replace(/[^0-9]/g, '');
    const waNumber = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
    window.open(`https://wa.me/${waNumber}?text=Assalamu%27alaikum%20Bapak%2FIbu%20Wali%20dari%20${encodeURIComponent(santri.nama)}`, '_blank');
    setShowContactModal(false);
  };

  const handleCall = (santri: any) => {
    const cleanPhone = santri.nomor_wali.replace(/[^0-9]/g, '');
    window.location.href = `tel:${cleanPhone}`;
    setShowContactModal(false);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setFormData(emptyForm);
    setWilayahForm(emptyWilayahForm());
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingSantri(null);
    setFormData(emptyForm);
    setWilayahForm(emptyWilayahForm());
  };

  const closeActionMenu = () => setActionMenuSantri(null);

  const handleLihatRiwayatIzin = (santri: SantriRow) => {
    closeActionMenu();
    navigate(izinDetailPath(santri.id), withBackTo('/master/santri'));
  };

  const handleLihatRiwayatBk = (santri: SantriRow) => {
    closeActionMenu();
    navigate(pembinaanDetailPath(santri.id), withBackTo('/master/santri'));
  };

  const handleLihatRiwayatKamar = (santri: SantriRow) => {
    closeActionMenu();
    navigate(santriKamarRiwayatPath(santri.id), withBackTo('/master/santri'));
  };

  const handleLihatTagihan = (santri: SantriRow) => {
    closeActionMenu();
    navigate(santriTagihanPath(santri.id), withBackTo('/master/santri'));
  };

  const handleActionHubungi = (santri: SantriRow) => {
    closeActionMenu();
    handleContactClick(santri);
  };

  const handleActionEdit = (santri: SantriRow) => {
    closeActionMenu();
    handleEdit(santri);
  };

  const handleActionHapus = (santri: SantriRow) => {
    closeActionMenu();
    requestDeleteSantri(santri);
  };

  const hasMore = pageItems.length < totalSantri;

  const availableRooms: string[] = [
    'Semua',
    ...Array.from(new Set((kamarList as { nama: string }[]).map((k) => k.nama))),
  ];

  const kelasOptions = (kelasList as { id: string; nama: string; tingkat?: string }[]).map((k) => ({
    value: k.nama,
    label: k.nama,
    sublabel: k.tingkat ? `Tingkat ${k.tingkat}` : undefined,
  }));

  const currentKamarForForm = formData.kamar;
  const kamarOptions = (kamarList as { id: string; nama: string; terisi?: number; kapasitas?: number }[])
    .filter((k) => {
      const terisi = k.terisi ?? 0;
      const kapasitas = k.kapasitas ?? 4;
      const isCurrent = currentKamarForForm === k.nama;
      return isCurrent || terisi < kapasitas;
    })
    .map((k) => ({
      value: k.nama,
      label: k.nama,
      sublabel:
        k.kapasitas != null
          ? `Terisi ${k.terisi ?? 0}/${k.kapasitas}`
          : undefined,
    }));

  const formPickersOpen = showAddModal || showEditModal;

  const openAddModal = useCallback(() => {
    setFormData({ ...emptyForm, jenis_kelamin: autoGender });
    setWilayahForm(emptyWilayahForm());
    setShowAddModal(true);
  }, [autoGender]);

  const headerAddAction = useMemo(
    () => ({ onClick: openAddModal, label: 'Tambah santri' }),
    [openAddModal]
  );

  useScreenAddAction(isSantriScreen ? headerAddAction : null, [isSantriScreen, headerAddAction]);

  const refreshSantriList = useCallback(async () => {
    await loadPage(1, false);
  }, [loadPage]);

  return (
    <PageWithPullRefresh
      keys={['santri', 'kamar', 'kelas', 'dashboard']}
      extraRefresh={refreshSantriList}
      className="space-y-3"
    >
      {/* Search Input */}
      <div className="relative">
        <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari nama, kelas, kamar..."
          className={`${appFieldThemed(theme)} pl-9 pr-8 shadow-xs ${
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

      <div className="flex items-center gap-1">
      <div ref={kamarFilterScrollRef} className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 scroll-px-3 sm:scroll-px-4">
        {availableRooms.map((room) => {
          const isSelected = selectedKamarFilter === room;
          return (
            <button
              key={room}
              type="button"
              onClick={() => setSelectedKamarFilter(room)}
              className={`whitespace-nowrap px-2.5 py-1 rounded-sm text-xs font-bold transition-all shrink-0 active:scale-95 ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : theme === 'dark'
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : 'bg-slate-50 text-slate-600 border border-slate-200/70'
              }`}
            >
              {room}
            </button>
          );
        })}
      </div>
      <ScrollNavButtons target={kamarFilterScrollRef} />
      </div>

      <div className="space-y-1.5">
        {(isLoading && pageItems.length === 0) || (listLoading && pageItems.length === 0) ? (
          <ListSkeleton rows={8} />
        ) : pageItems.length === 0 ? (
          <EmptyState
            icon={searchQuery ? Search : Users}
            title={searchQuery ? 'Tidak ada hasil' : 'Belum ada santri'}
            description={
              searchQuery ? 'Coba kata kunci lain atau hapus filter kamar.' : 'Ketuk + di header untuk menambahkan santri.'
            }
            variant="inline"
            dark={theme === 'dark'}
          />
        ) : (
          pageItems.map((santri) => {
            const pelanggaran = santri.jumlah_pelanggaran ?? 0;
            const kamarNama = santri.kamar || '-';

            return (
              <div
                key={santri.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate(santriDetailPath(santri.id), withBackTo('/master/santri'))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(santriDetailPath(santri.id), withBackTo('/master/santri'));
                  }
                }}
                className={cn(
                  appCardClass,
                  'px-2.5 py-2 flex gap-2 cursor-pointer active:scale-[0.99] transition-transform'
                )}
              >
                <SantriAvatar nama={santri.nama} foto={santri.foto} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <h3
                      className={`text-xs font-bold truncate leading-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}
                    >
                      {santri.nama}
                    </h3>
                    {santri.is_ketua_kamar ? (
                      <Crown className="w-3 h-3 shrink-0 text-amber-600" aria-label="Ketua kamar" />
                    ) : null}
                    {pelanggaran > 0 ? (
                      <span className="text-[9px] font-semibold text-amber-700 shrink-0">{pelanggaran} pelanggaran</span>
                    ) : null}
                  </div>
                  <p className={`text-[10px] truncate ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {santri.kelas} · {kamarNama}
                    {santri.nomor_wali ? ` · ${santri.nomor_wali}` : ''}
                  </p>
                  {formatAsalWilayahShort(santri) !== '—' ? (
                    <p className={`text-[10px] truncate mt-0.5 ${theme === 'dark' ? 'text-teal-400/90' : 'text-teal-700'}`}>
                      Asal: {formatAsalWilayahShort(santri)}
                    </p>
                  ) : null}
                  {santri.catatan ? (
                    <p className={`text-[10px] truncate mt-0.5 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                      {santri.catatan}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActionMenuSantri(santri);
                  }}
                  className={`p-1.5 rounded-sm shrink-0 self-center transition-colors ${
                    theme === 'dark'
                      ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                  title="Aksi"
                  aria-label={`Aksi untuk ${santri.nama}`}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
        {hasMore && pageItems.length > 0 ? (
          <div className="pt-2 pb-1">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={listLoading}
              onClick={() => void loadPage(listPage + 1, true)}
            >
              {listLoading ? 'Memuat...' : `Muat lagi (${pageItems.length} / ${totalSantri})`}
            </Button>
          </div>
        ) : null}
      </div>

      <AppModal
        open={showAddModal}
        onClose={handleCloseAddModal}
        title="Tambah Santri"
        description="Lengkapi data santri baru"
        className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
        footer={
          <AppModalFooter>
            <Button type="button" variant="outline" className="flex-1" onClick={handleCloseAddModal}>
              Batal
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={saveMutation.isPending}
              onClick={handleSave}
            >
              <Save className="w-4 h-4" />
              Simpan
            </Button>
          </AppModalFooter>
        }
      >
            <SantriFormFields
              jenisAsrama={jenisAsrama}
              formData={formData}
              setFormData={setFormData}
              theme={theme}
              kelasList={kelasList}
              kamarList={kamarList}
              onTakePhoto={handleTakePhoto}
              onOpenKelasPicker={() => setOptionPicker('kelas')}
              onOpenKamarPicker={() => setOptionPicker('kamar')}
              wilayah={wilayahForm}
              onWilayahChange={setWilayahForm}
            />
      </AppModal>

      <AppModal
        open={showEditModal && !!editingSantri}
        onClose={handleCloseEditModal}
        title="Ubah Santri"
        description="Perbarui data santri"
        className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
        footer={
          <AppModalFooter>
            <Button type="button" variant="outline" className="flex-1" onClick={handleCloseEditModal}>
              Batal
            </Button>
            <Button type="button" className="flex-1" disabled={saveMutation.isPending} onClick={handleSave}>
              <Save className="w-4 h-4" />
              Simpan
            </Button>
          </AppModalFooter>
        }
      >
            <SantriFormFields
              jenisAsrama={jenisAsrama}
              formData={formData}
              setFormData={setFormData}
              theme={theme}
              kelasList={kelasList}
              kamarList={kamarList}
              onTakePhoto={handleTakePhoto}
              onOpenKelasPicker={() => setOptionPicker('kelas')}
              onOpenKamarPicker={() => setOptionPicker('kamar')}
              includeWaId="include_wa_edit"
              wilayah={wilayahForm}
              onWilayahChange={setWilayahForm}
            />
      </AppModal>

      {formPickersOpen && (
        <>
          <BottomPicker
            open={optionPicker === 'kelas'}
            onClose={() => setOptionPicker(null)}
            title="Pilih Kelas"
            description="Data dari Kelola Data → Kelas"
            searchPlaceholder="Cari kelas..."
            options={kelasOptions}
            value={formData.kelas}
            onSelect={(v) => setFormData({ ...formData, kelas: v })}
          />
          <BottomPicker
            open={optionPicker === 'kamar'}
            onClose={() => setOptionPicker(null)}
            title="Pilih Kamar"
            description="Data dari Kelola Data → Kamar"
            searchPlaceholder="Cari kamar..."
            options={kamarOptions}
            value={formData.kamar}
            onSelect={(v) => setFormData({ ...formData, kamar: v })}
            allowClear
            clearLabel="Tanpa kamar"
          />
        </>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={confirmDialog.close}
        onConfirm={confirmDialog.confirm}
        loading={confirmDialog.loading}
        title={confirmDialog.request?.title}
        message={confirmDialog.request?.message ?? ''}
        confirmLabel={confirmDialog.request?.confirmLabel}
        cancelLabel={confirmDialog.request?.cancelLabel}
        destructive={confirmDialog.request?.destructive}
        className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
      />

      {actionMenuSantri &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[105] flex flex-col justify-end">
            <button
              type="button"
              aria-label="Tutup menu aksi"
              className="absolute inset-0 bg-black/50"
              onClick={closeActionMenu}
            />
            <div
              role="menu"
              className={cn(
                appCardClass,
                'relative w-full rounded-t-md shadow-2xl overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`px-4 py-3 border-b ${theme === 'dark' ? 'border-slate-700' : 'border-slate-100'}`}
              >
                <p
                  className={`text-sm font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}
                >
                  {actionMenuSantri.nama}
                </p>
                <p className={`text-[11px] truncate ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                  {actionMenuSantri.kelas}
                  {actionMenuSantri.kamar ? ` · ${actionMenuSantri.kamar}` : ''}
                </p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeActionMenu();
                    navigate(
                      santriDetailPath(actionMenuSantri.id),
                      withBackTo('/master/santri')
                    );
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-slate-100 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-4 h-4 shrink-0 text-emerald-600" />
                  Profil lengkap
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleLihatRiwayatIzin(actionMenuSantri)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-slate-100 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <ClockAlert className="w-4 h-4 shrink-0 text-amber-600" />
                  Lihat riwayat izin
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleLihatRiwayatBk(actionMenuSantri)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-slate-100 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
                  Lihat riwayat pelanggaran
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleLihatTagihan(actionMenuSantri)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-slate-100 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="w-4 h-4 shrink-0 text-rose-600" />
                  Lihat tagihan
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleLihatRiwayatKamar(actionMenuSantri)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-slate-100 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <BedDouble className="w-4 h-4 shrink-0 text-blue-600" />
                  Riwayat & info kamar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleActionHubungi(actionMenuSantri)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-slate-100 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <MessageCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                  Hubungi wali
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleActionEdit(actionMenuSantri)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-slate-100 hover:bg-slate-700' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Edit2 className="w-4 h-4 shrink-0 text-blue-600" />
                  Ubah data
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleActionHapus(actionMenuSantri)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80 ${
                    theme === 'dark' ? 'text-red-400 hover:bg-slate-700' : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  Hapus
                </button>
              </div>
              <button
                type="button"
                onClick={closeActionMenu}
                className={`w-full py-3.5 text-sm font-semibold border-t ${
                  theme === 'dark'
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-100 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Batal
              </button>
            </div>
          </div>,
          document.body
        )}

      {selectedSantriForContact && (
        <AppModal
          open={showContactModal}
          onClose={() => {
            setShowContactModal(false);
            setSelectedSantriForContact(null);
          }}
          title="Hubungi Wali"
          className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
        >
          <div className={`rounded-sm p-4 mb-4 -mx-1 ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-50'}`}>
            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              {selectedSantriForContact.nama}
            </p>
            <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              {selectedSantriForContact.nomor_wali}
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleWhatsApp(selectedSantriForContact)}
              className={`w-full py-3 rounded-sm font-semibold text-xs transition-all flex items-center justify-center gap-2 ${
                theme === 'dark'
                  ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700 hover:bg-emerald-900'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={() => handleCall(selectedSantriForContact)}
              className={`w-full py-3 rounded-sm font-semibold text-xs transition-all flex items-center justify-center gap-2 ${
                theme === 'dark'
                  ? 'bg-blue-900/50 text-blue-400 border border-blue-700 hover:bg-blue-900'
                  : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
              }`}
            >
              <Phone className="w-4 h-4" />
              <span>Telepon</span>
            </button>
          </div>
        </AppModal>
      )}
    </PageWithPullRefresh>
  );
}
