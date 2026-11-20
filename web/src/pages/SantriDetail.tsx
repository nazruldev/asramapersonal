import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import {
  AlertTriangle,
  BedDouble,
  CalendarCheck,
  ChevronRight,
  CircleAlert,
  ClockAlert,
  Crown,
  Edit2,
  FileDown,
  FileText,
  ListTodo,
  MessageCircle,
  Phone,
  Save,
  Share2,
  ShieldAlert,
  Trash2,
  User,
  UserRound,
} from 'lucide-react';
import { useAppStore, type EntityRow } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { useAppReload } from '@/hooks/use-app-reload';
import { EmptyState } from '@/components/ui/empty-state';
import { AppModal } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BottomPicker } from '@/components/ui/bottom-picker';
import { Button } from '@/components/ui/button';
import { SantriFormFields } from '@/components/santri-form-fields';
import { emptyWilayahForm, wilayahFromSantri } from '@/components/wilayah-asal-fields';
import { AsalWilayahInfo } from '@/components/asal-wilayah-info';
import { HeaderNeutralButton } from '@/components/header-action-button';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { useTheme } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { withBackTo } from '@/lib/app-navigation';
import { pembinaanDetailPath } from '@/lib/pembinaan-group';
import { izinDetailPath, isIzinTerlambat, type IzinRow } from '@/lib/izin-group';
import { formatLamaDiKamar, kamarDetailPath } from '@/lib/kamar-path';
import { santriKamarRiwayatPath } from '@/lib/santri-kamar-riwayat';
import {
  formatSantriDate,
  formatSantriDateTime,
  parseSantriIdFromDetailPath,
  type SantriProfile,
} from '@/lib/santri-detail';
import { appCardClass, appMutedTextClass, appSectionTitleClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import type { PembinaanRow } from '@/lib/pembinaan-group';
import { fetchSantriById } from '@/lib/santri-api';
import { fetchAbsensiForLaporanPeriod } from '@/lib/absensi-api';
import { fetchIzinForLaporanPeriod, fetchPembinaanForLaporanPeriod } from '@/lib/laporan-data-api';
import {
  downloadLaporanPerSantri,
  downloadSingleLaporanPdf,
  shareLaporanPerSantri,
  shareSingleLaporanPdf,
} from '@/lib/laporan-print';
import type { LaporanContext, LaporanPeriod, LaporanReportId } from '@/lib/laporan-reports';
import type { KegiatanSchedule } from '@/lib/kegiatan-schedule';

type SantriReportId = 'persantri' | Extract<LaporanReportId, 'absensi' | 'izin' | 'pembinaan'>;

const SANTRI_REPORTS: { id: SantriReportId; title: string; desc: string; icon: typeof FileText; tone: string }[] = [
  { id: 'persantri', title: 'Laporan Santri', desc: 'Laporan lengkap santri ini (absensi, izin, pembinaan).', icon: UserRound, tone: 'text-blue-600' },
  { id: 'absensi', title: 'Rekap Absensi', desc: 'Riwayat kehadiran santri ini.', icon: CalendarCheck, tone: 'text-emerald-600' },
  { id: 'izin', title: 'Rekap Perizinan', desc: 'Riwayat izin keluar santri ini.', icon: ClockAlert, tone: 'text-amber-600' },
  { id: 'pembinaan', title: 'Rekap Pembinaan', desc: 'Catatan pembinaan/pelanggaran santri ini.', icon: ShieldAlert, tone: 'text-violet-600' },
];

const emptyForm = {
  nama: '',
  kelas: '',
  kamar: '',
  nomor_wali: '',
  include_wa: true,
  catatan: '',
  catatan_medis: '',
  foto: '',
};

function getInitials(name: string) {
  if (!name) return 'S';
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className={appMutedTextClass}>{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}

type ActionBtnProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
};

function ActionBtn({ icon, label, onClick, danger }: ActionBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        appCardClass,
        'w-full flex items-center gap-3 px-3.5 py-3 text-left text-sm font-medium active:scale-[0.99] transition-transform',
        danger && 'border-rose-200/80 dark:border-rose-900/50'
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className={cn('flex-1 min-w-0', danger ? 'text-rose-600 dark:text-rose-400' : '')}>
        {label}
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
    </button>
  );
}

export default function SantriDetail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const santriId = parseSantriIdFromDetailPath(pathname);
  const reload = useAppReload();
  const { theme } = useTheme();
  const santriReady = useReloadKeyReady('santri');
  const confirmDialog = useConfirmDialog();

  const santriList = useAppStore((s) => s.santri) as SantriProfile[];
  const kamarList = useAppStore((s) => s.kamar) as {
    id: string;
    nama: string;
    terisi?: number;
    kapasitas?: number;
    ketua?: string;
  }[];
  const kelasList = useAppStore((s) => s.kelas) as { id: string; nama: string; tingkat?: string }[];
  const izinList = useAppStore((s) => s.izin) as IzinRow[];
  const pembinaanList = useAppStore((s) => s.pembinaan) as PembinaanRow[];
  const settings = useAppStore((s) => s.settings);
  const dashboardStats = useAppStore((s) => s.dashboard);
  const kegiatanMaster = useAppStore((s) => s.kegiatan) as KegiatanSchedule[];

  const santriFromStore = useMemo(
    () => santriList.find((s) => s.id === santriId),
    [santriList, santriId]
  );
  const [fetchedSantri, setFetchedSantri] = useState<SantriProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /** Profil lengkap dari API; daftar santri di store hanya ringkasan (tanpa nomor wali, dll.). */
  const santri = fetchedSantri ?? santriFromStore;

  useEffect(() => {
    if (!santriId) return;
    setDetailLoading(true);
    void fetchSantriById(santriId)
      .then((row) => setFetchedSantri(row as SantriProfile))
      .catch(() => setFetchedSantri(null))
      .finally(() => setDetailLoading(false));
  }, [santriId]);

  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [reportPick, setReportPick] = useState<SantriReportId | null>(null);
  const [reportCtx, setReportCtx] = useState<LaporanContext | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportBusy, setReportBusy] = useState<'unduh' | 'bagikan' | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [optionPicker, setOptionPicker] = useState<'kelas' | 'kamar' | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [wilayahForm, setWilayahForm] = useState(emptyWilayahForm);

  const detailBack = pathname;

  const izinRecords = useMemo(() => {
    if (!santriId) return [];
    return izinList.filter((i) => i.santri_id === santriId);
  }, [izinList, santriId]);

  const activeIzin = useMemo(
    () => izinRecords.find((i) => i.status_kembali === 'Belum') ?? null,
    [izinRecords]
  );

  const pembinaanCount = useMemo(() => {
    if (!santriId) return 0;
    return pembinaanList.filter((p) => String(p.santri_id) === santriId).length;
  }, [pembinaanList, santriId]);

  const kamarRecord = useMemo(() => {
    const nama = santri?.kamar?.trim();
    if (!nama) return null;
    return kamarList.find((k) => k.nama === nama) ?? null;
  }, [kamarList, santri?.kamar]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/santri/${santriId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Gagal menyimpan');
      return data;
    },
    onSuccess: (data) => {
      toast.success('Data santri berhasil diperbarui');
      void reload(['santri', 'kamar', 'dashboard']);
      setFetchedSantri(data as SantriProfile);
      setShowEditModal(false);
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
      navigate('/master/santri');
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus santri'),
  });

  const openEdit = useCallback(() => {
    if (!santri) return;
    setFormData({
      nama: santri.nama,
      kelas: santri.kelas || '',
      kamar: santri.kamar || '',
      nomor_wali: santri.nomor_wali || '',
      include_wa: santri.include_wa !== false,
      catatan: santri.catatan || '',
      catatan_medis: santri.catatan_medis || '',
      foto: santri.foto || '',
    });
    setWilayahForm(wilayahFromSantri(santri));
    setShowEditModal(true);
  }, [santri]);

  const openLaporanSheet = useCallback(() => {
    setReportSheetOpen(true);
    if (reportCtx) return;
    setReportLoading(true);
    const period: LaporanPeriod = '30d';
    Promise.all([
      fetchAbsensiForLaporanPeriod(period),
      fetchIzinForLaporanPeriod(period),
      fetchPembinaanForLaporanPeriod(period),
    ])
      .then(([abs, iz, pb]) =>
        setReportCtx({
          namaAsrama: settings.namaAsrama,
          period,
          stats: dashboardStats,
          santri: santriList as unknown as EntityRow[],
          kamar: kamarList as unknown as EntityRow[],
          absensi: abs as EntityRow[],
          izin: iz as EntityRow[],
          pembinaan: pb as EntityRow[],
          kegiatan: kegiatanMaster,
        })
      )
      .catch(() => toast.error('Gagal memuat data laporan'))
      .finally(() => setReportLoading(false));
  }, [reportCtx, settings.namaAsrama, dashboardStats, santriList, kamarList, kegiatanMaster]);

  const runSantriReport = useCallback(
    async (action: 'unduh' | 'bagikan') => {
      if (!reportCtx || !reportPick || !santri) return;
      const sid = String(santri.id);
      setReportBusy(action);
      try {
        if (reportPick === 'persantri') {
          await (action === 'unduh'
            ? downloadLaporanPerSantri(reportCtx, sid)
            : shareLaporanPerSantri(reportCtx, sid));
        } else {
          await (action === 'unduh'
            ? downloadSingleLaporanPdf(reportPick, reportCtx, sid)
            : shareSingleLaporanPdf(reportPick, reportCtx, sid));
        }
        setReportPick(null);
      } catch {
        toast.error(action === 'unduh' ? 'Gagal mengunduh laporan' : 'Gagal membagikan laporan');
      } finally {
        setReportBusy(null);
      }
    },
    [reportCtx, reportPick, santri]
  );

  const headerEditAction = useMemo(
    () => (
      <>
        <HeaderNeutralButton onClick={() => setActionSheetOpen(true)} label="Aksi" withLabel>
          <ListTodo className="w-5 h-5" strokeWidth={2} />
        </HeaderNeutralButton>
        <HeaderNeutralButton onClick={openLaporanSheet} label="Laporan santri" withLabel>
          <FileText className="w-5 h-5" strokeWidth={2} />
        </HeaderNeutralButton>
      </>
    ),
    [openLaporanSheet]
  );

  useScreenHeaderActions(santriId && santri && santriReady && !detailLoading ? headerEditAction : null, [
    santriId,
    santri,
    santriReady,
    detailLoading,
    headerEditAction,
  ]);

  const handleTakePhoto = async (source: 'camera' | 'gallery') => {
    try {
      const { Camera: CapacitorCamera, CameraResultType, CameraSource } = await import(
        '@capacitor/camera'
      );
      const photo = await CapacitorCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });
      setFormData({ ...formData, foto: photo.dataUrl || '' });
    } catch {
      // dibatalkan pengguna
    }
  };

  const handleSave = () => {
    if (!formData.nama || !formData.kelas) {
      toast.error('Nama dan kelas harus diisi');
      return;
    }
    saveMutation.mutate({
      ...formData,
      ...wilayahForm,
      include_wa: formData.include_wa,
    });
  };

  const requestDelete = () => {
    if (!santri) return;
    confirmDialog.ask({
      message: `Hapus "${santri.nama}" secara permanen? Riwayat izin, absensi, catatan BK, penjadwalan, dan riwayat kamar santri ini ikut dihapus.`,
      confirmLabel: 'Ya, Hapus',
      destructive: true,
      onConfirm: () =>
        new Promise<void>((resolve, reject) => {
          deleteMutation.mutate(santri.id, {
            onSuccess: () => resolve(),
            onError: () => reject(),
          });
        }),
    });
  };

  const handleContact = () => {
    if (!santri?.nomor_wali) {
      toast.error('Nomor wali belum diisi');
      return;
    }
    if (santri.include_wa !== false) {
      setShowContactModal(true);
    } else {
      const cleanPhone = santri.nomor_wali.replace(/[^0-9]/g, '');
      window.location.href = `tel:${cleanPhone}`;
    }
  };

  const handleWhatsApp = () => {
    if (!santri?.nomor_wali) return;
    const cleanPhone = santri.nomor_wali.replace(/[^0-9]/g, '');
    const waNumber = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
    window.open(
      `https://wa.me/${waNumber}?text=Assalamu%27alaikum%20Bapak%2FIbu%20Wali%20dari%20${encodeURIComponent(santri.nama)}`,
      '_blank'
    );
    setShowContactModal(false);
  };

  const handleCall = () => {
    if (!santri?.nomor_wali) return;
    const cleanPhone = santri.nomor_wali.replace(/[^0-9]/g, '');
    window.location.href = `tel:${cleanPhone}`;
    setShowContactModal(false);
  };

  const kelasOptions = kelasList.map((k) => ({
    value: k.nama,
    label: k.nama,
    sublabel: k.tingkat ? `Tingkat ${k.tingkat}` : undefined,
  }));

  const currentKamarForForm = formData.kamar;
  const kamarOptions = kamarList
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
        k.kapasitas != null ? `Terisi ${k.terisi ?? 0}/${k.kapasitas}` : undefined,
    }));

  const refreshSantriDetail = useCallback(async () => {
    if (!santriId) return;
    setDetailLoading(true);
    try {
      const row = await fetchSantriById(santriId);
      setFetchedSantri(row as SantriProfile);
    } catch {
      setFetchedSantri(null);
    } finally {
      setDetailLoading(false);
    }
  }, [santriId]);

  if (!santriId) {
    return <EmptyState icon={CircleAlert} title="Halaman tidak valid" variant="inline" />;
  }

  if (detailLoading && !santri) {
    return (
      <div className={cn(appCardClass, 'p-8 text-center text-sm text-muted-foreground')}>
        Memuat data santri...
      </div>
    );
  }

  if (santriReady && !detailLoading && !santri) {
    return (
      <EmptyState icon={User} title="Santri tidak ditemukan" variant="inline">
        <button
          type="button"
          onClick={() => navigate('/master/santri')}
          className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
        >
          Kembali ke daftar
        </button>
      </EmptyState>
    );
  }

  const pelanggaran = santri?.jumlah_pelanggaran ?? 0;
  const terdaftarLabel = santri?.created_at
    ? formatSantriDateTime(santri.created_at)
    : 'Belum tercatat';
  const diperbaruiLabel = santri?.updated_at ? formatSantriDateTime(santri.updated_at) : '—';
  const hubungiLabel =
    santri?.nomor_wali
      ? santri.include_wa === false
        ? 'Telepon langsung'
        : 'WhatsApp atau telepon'
      : 'Nomor belum diisi';

  return (
    <PageWithPullRefresh
      keys={['santri', 'kamar', 'kelas', 'izin', 'pembinaan']}
      extraRefresh={refreshSantriDetail}
      className="space-y-4"
    >
      {!santriReady || !santri ? (
        <div className={cn(appCardClass, 'p-8 text-center text-xs text-muted-foreground')}>
          Memuat profil santri…
        </div>
      ) : (
        <>
          <div className={cn(appCardClass, 'p-4 space-y-3')}>
            <div className="flex gap-3">
              {santri.foto ? (
                <img
                  src={santri.foto}
                  alt={santri.nama}
                  className="w-16 h-16 rounded-sm object-cover shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-sm bg-emerald-700 text-white font-bold text-lg flex items-center justify-center shrink-0">
                  {getInitials(santri.nama)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 leading-snug">
                    {santri.nama}
                  </h2>
                  {santri.is_ketua_kamar ? (
                    <Crown className="w-4 h-4 text-amber-600 shrink-0" aria-label="Ketua kamar" />
                  ) : null}
                </div>
                <p className={cn('text-xs mt-0.5', appMutedTextClass)}>
                  Kelas {santri.kelas || '—'}
                  {santri.kamar ? ` · ${santri.kamar}` : ' · Belum punya kamar'}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {activeIzin ? (
                    isIzinTerlambat(activeIzin) ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Izin · terlambat
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800">
                        Sedang izin
                      </span>
                    )
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800">
                      Di asrama
                    </span>
                  )}
                  {pelanggaran > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600">
                      {pelanggaran} jumlah pelanggaran
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className={cn(appCardClass, 'p-2.5 text-center')}>
                <p className="text-lg font-black text-slate-900 dark:text-slate-50 tabular-nums">
                  {izinRecords.length}
                </p>
                <p className="text-[10px] text-slate-500">Riwayat izin</p>
              </div>
              <div className={cn(appCardClass, 'p-2.5 text-center')}>
                <p className="text-lg font-black text-slate-900 dark:text-slate-50 tabular-nums">
                  {pembinaanCount}
                </p>
                <p className="text-[10px] text-slate-500">Catatan BK</p>
              </div>
            </div>
          </div>

          <div className={cn(appCardClass, 'p-4 space-y-2.5')}>
            <p className={appSectionTitleClass}>Informasi</p>
            <div className="space-y-2 pb-1 border-b border-border">
              <p className={cn('text-[11px] font-semibold', appMutedTextClass)}>Asal wilayah</p>
              <AsalWilayahInfo row={santri} Row={InfoRow} />
            </div>
            <InfoRow label="Nomor wali" value={santri.nomor_wali?.trim() || '—'} />
            <InfoRow label="Cara hubungi" value={hubungiLabel} />
            <InfoRow label="Terdaftar" value={terdaftarLabel} />
            <InfoRow label="Terakhir diubah" value={diperbaruiLabel} />
            {santri.kamar ? (
              <>
                <InfoRow
                  label="Masuk kamar ini"
                  value={formatSantriDate(santri.masuk_kamar_sejak)}
                />
                <InfoRow
                  label="Lama di kamar"
                  value={formatLamaDiKamar(santri.masuk_kamar_sejak)}
                />
                {kamarRecord?.ketua ? (
                  <InfoRow label="Ketua kamar" value={kamarRecord.ketua} />
                ) : null}
              </>
            ) : null}
            {santri.catatan ? (
              <div className="pt-1 border-t border-border">
                <p className={cn('text-[11px] mb-1', appMutedTextClass)}>Catatan</p>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {santri.catatan}
                </p>
              </div>
            ) : null}
            {santri.catatan_medis ? (
              <div className="pt-1 border-t border-border">
                <p className={cn('text-[11px] mb-1', appMutedTextClass)}>Catatan medis</p>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {santri.catatan_medis}
                </p>
              </div>
            ) : null}
            {kamarRecord ? (
              <button
                type="button"
                onClick={() =>
                  navigate(kamarDetailPath(kamarRecord.id), withBackTo(detailBack))
                }
                className="w-full mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 text-left"
              >
                Buka detail kamar →
              </button>
            ) : null}
          </div>

        </>
      )}

      <AppModal
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setFormData(emptyForm);
          setWilayahForm(emptyWilayahForm());
        }}
        title="Ubah Santri"
        description="Perbarui data santri"
      >
        <SantriFormFields
          formData={formData}
          setFormData={setFormData}
          theme={theme}
          kelasList={kelasList}
          kamarList={kamarList}
          onTakePhoto={handleTakePhoto}
          onOpenKelasPicker={() => setOptionPicker('kelas')}
          onOpenKamarPicker={() => setOptionPicker('kamar')}
          includeWaId="include_wa_detail"
          wilayah={wilayahForm}
          onWilayahChange={setWilayahForm}
        />
        <div className="flex gap-2 mt-5 pb-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => {
              setShowEditModal(false);
              setFormData(emptyForm);
              setWilayahForm(emptyWilayahForm());
            }}
          >
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
        </div>
      </AppModal>

      {showEditModal && (
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

      <AppModal
        open={showContactModal}
        onClose={() => setShowContactModal(false)}
        title="Hubungi Wali"
      >
        {santri ? (
          <>
            <div className={cn(appCardClass, 'p-4 mb-4 -mx-1')}>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{santri.nama}</p>
              <p className={cn('text-xs', appMutedTextClass)}>{santri.nomor_wali}</p>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleWhatsApp}
                className="w-full py-3 rounded-sm font-semibold text-xs transition-all flex items-center justify-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={handleCall}
                className="w-full py-3 rounded-sm font-semibold text-xs transition-all flex items-center justify-center gap-2 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
              >
                <Phone className="w-4 h-4" />
                Telepon
              </button>
            </div>
          </>
        ) : null}
      </AppModal>

      {/* Sheet daftar aksi profil */}
      <AppModal
        open={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        title="Aksi santri"
      >
        {santri ? (
          <div className="space-y-2">
            <ActionBtn
              icon={<ClockAlert className="w-4 h-4 text-amber-600" />}
              label="Riwayat izin"
              onClick={() => {
                setActionSheetOpen(false);
                navigate(izinDetailPath(santri.id), withBackTo(detailBack));
              }}
            />
            <ActionBtn
              icon={<ShieldAlert className="w-4 h-4 text-rose-600" />}
              label="Riwayat pembinaan (BK)"
              onClick={() => {
                setActionSheetOpen(false);
                navigate(pembinaanDetailPath(santri.id), withBackTo(detailBack));
              }}
            />
            <ActionBtn
              icon={<BedDouble className="w-4 h-4 text-blue-600" />}
              label="Riwayat & info kamar"
              onClick={() => {
                setActionSheetOpen(false);
                navigate(santriKamarRiwayatPath(santri.id), withBackTo(detailBack));
              }}
            />
            <ActionBtn
              icon={<MessageCircle className="w-4 h-4 text-emerald-600" />}
              label="Hubungi wali"
              onClick={() => {
                setActionSheetOpen(false);
                handleContact();
              }}
            />
            <ActionBtn
              icon={<Edit2 className="w-4 h-4 text-blue-600" />}
              label="Ubah data santri"
              onClick={() => {
                setActionSheetOpen(false);
                openEdit();
              }}
            />
            <ActionBtn
              icon={<Trash2 className="w-4 h-4 text-rose-600" />}
              label="Hapus santri"
              onClick={() => {
                setActionSheetOpen(false);
                requestDelete();
              }}
              danger
            />
          </div>
        ) : null}
      </AppModal>

      {/* Sheet pilih tipe laporan santri */}
      <AppModal
        open={reportSheetOpen}
        onClose={() => setReportSheetOpen(false)}
        title={`Laporan — ${santri?.nama ?? 'Santri'}`}
      >
        <div className="space-y-2">
          {SANTRI_REPORTS.map((r) => {
            const RIcon = r.icon;
            return (
              <button
                key={r.id}
                type="button"
                disabled={reportLoading}
                onClick={() => {
                  setReportSheetOpen(false);
                  setReportPick(r.id);
                }}
                className={cn(
                  appCardClass,
                  'w-full p-3.5 text-left flex items-center gap-3 hover:border-emerald-400 dark:hover:border-emerald-600 active:scale-[0.99] transition-all disabled:opacity-60'
                )}
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
          {reportLoading && (
            <p className="text-[11px] text-slate-500 text-center py-1">Memuat data laporan…</p>
          )}
        </div>
      </AppModal>

      {/* Sheet aksi: unduh atau bagikan */}
      <AppModal
        open={reportPick !== null}
        onClose={() => setReportPick(null)}
        title="Unduh atau bagikan?"
      >
        <div className="space-y-2">
          <button
            type="button"
            disabled={reportBusy !== null || reportLoading || !reportCtx}
            onClick={() => void runSantriReport('unduh')}
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
            {reportBusy === 'unduh' && (
              <span className="text-[10px] font-bold text-emerald-700 shrink-0">Menyiapkan…</span>
            )}
          </button>
          <button
            type="button"
            disabled={reportBusy !== null || reportLoading || !reportCtx}
            onClick={() => void runSantriReport('bagikan')}
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
            {reportBusy === 'bagikan' && (
              <span className="text-[10px] font-bold text-teal-700 shrink-0">Menyiapkan…</span>
            )}
          </button>
        </div>
      </AppModal>

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
      />
    </PageWithPullRefresh>
  );
}
