import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import {
  BedDouble,
  Crown,
  RefreshCw,
  X,
  ArrowRightLeft,
  Users,
  Package,
  Edit2,
  Trash2,
  Save,
  CircleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  appFieldThemed,
  appLabelThemed,
  appTextareaClass,
} from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import {
  formatTanggalFasilitas,
  formatUsiaFasilitas,
  type KamarFasilitasRow,
} from '@/lib/kamar-fasilitas';
import { BottomPicker, type BottomPickerOption } from '@/components/ui/bottom-picker';
import { isSantriKetuaOfKamar, pickSantriLongestInKamar } from '@/lib/kamar-ketua';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AppModal } from '@/components/ui/app-modal';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { useTheme } from '@/lib/theme';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { HeaderAddButton } from '@/components/header-action-button';
import { toast } from '@/lib/toast';
import { formatLamaDiKamar, parseKamarIdFromPath } from '@/lib/kamar-path';

type KamarRow = {
  id: string;
  nama: string;
  kapasitas: number;
  lantai?: string;
  ketua?: string;
  terisi?: number;
  santriList?: {
    id: string;
    nama: string;
    kelas?: string;
    masuk_kamar_sejak?: string;
  }[];
  fasilitas?: KamarFasilitasRow[];
};

type DetailTab = 'penempatan' | 'fasilitas';

const emptyFasilitasForm = {
  nama: '',
  tanggal: new Date().toISOString().slice(0, 10),
  keterangan: '',
};

export default function KamarDetail() {
  const { pathname } = useLocation();
  const kamarId = parseKamarIdFromPath(pathname);
  const reload = useAppReload();
  const { theme } = useTheme();
  const confirmDialog = useConfirmDialog();
  const kamarReady = useReloadKeyReady('kamar');
  const kamarList = useAppStore((s) => s.kamar) as KamarRow[];
  const santriList = useAppStore((s) => s.santri);

  const [detailTab, setDetailTab] = useState<DetailTab>('penempatan');
  const [showSantriModal, setShowSantriModal] = useState(false);
  const [changeKetuaOpen, setChangeKetuaOpen] = useState(false);
  const [movePickerSantriId, setMovePickerSantriId] = useState<string | null>(null);
  const [showFasilitasModal, setShowFasilitasModal] = useState(false);
  const [editingFasilitas, setEditingFasilitas] = useState<KamarFasilitasRow | null>(null);
  const [fasilitasForm, setFasilitasForm] = useState(emptyFasilitasForm);
  const [fasilitasSaving, setFasilitasSaving] = useState(false);

  const kamar = kamarList.find((k) => k.id === kamarId);

  const invalidate = () => {
    void reload(['kamar', 'santri', 'dashboard']);
  };

  const santriInKamar = kamar?.santriList ?? [];
  const kapasitas = kamar?.kapasitas || 4;
  const isFull = santriInKamar.length >= kapasitas;

  const ketuaSantri = useMemo(() => {
    if (!kamar?.ketua) return null;
    return santriInKamar.find((s) => s.nama === kamar.ketua) ?? null;
  }, [kamar?.ketua, santriInKamar]);

  const anggotaLain = useMemo(() => {
    if (!kamar?.ketua) return santriInKamar;
    return santriInKamar.filter((s) => s.nama !== kamar.ketua);
  }, [kamar?.ketua, santriInKamar]);

  const handleSetKetua = async (santriId: string) => {
    if (!kamar) return;
    try {
      const res = await fetch(`/api/kamar/${kamar.id}/ketua`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ santri_id: santriId }),
      });
      if (!res.ok) throw new Error('failed');
      toast.success('Ketua kamar berhasil ditetapkan');
      invalidate();
      setChangeKetuaOpen(false);
    } catch {
      toast.error('Gagal menetapkan ketua kamar');
    }
  };

  const handleAddSantriToKamar = async (
    santriId: string,
    opts?: { moveKamar?: boolean; autoPromoteKetua?: boolean }
  ) => {
    if (!kamar) return;
    try {
      const res = await fetch(`/api/santri/${santriId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kamar: kamar.nama,
          from_kamar_page: true,
          move_kamar: Boolean(opts?.moveKamar),
          auto_promote_ketua_kamar_lama: Boolean(opts?.autoPromoteKetua),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        promoted_ketua_nama?: string;
        promoted_ketua_kamar?: string;
      };
      if (!res.ok) {
        toast.error(data.error || 'Gagal menambahkan santri');
        return;
      }
      if (opts?.moveKamar) {
        if (data.promoted_ketua_nama && data.promoted_ketua_kamar) {
          toast.success(
            `Santri dipindah. ${data.promoted_ketua_nama} otomatis jadi ketua ${data.promoted_ketua_kamar}.`
          );
        } else {
          toast.success('Santri berhasil dipindah ke kamar ini');
        }
      } else {
        toast.success('Santri berhasil ditambahkan ke kamar');
      }
      invalidate();
      setShowSantriModal(false);
    } catch {
      toast.error('Gagal menambahkan santri ke kamar');
    }
  };

  const requestAddSantriToKamar = (santriId: string) => {
    if (!kamar) return;
    const santri = (santriList as { id: string; nama: string; kelas?: string; kamar?: string }[]).find(
      (s) => s.id === santriId
    );
    if (!santri) return;

    const prevKamar = (santri.kamar ?? '').trim();
    const moving = Boolean(prevKamar);
    const wasKetua = isSantriKetuaOfKamar(santri, kamarList);

    if (wasKetua && prevKamar) {
      const candidate = pickSantriLongestInKamar(
        santriList as { id: string; nama?: string; kamar?: string; masuk_kamar_sejak?: string }[],
        prevKamar,
        santri.id
      );
      const candidateLine = candidate
        ? `Jika setuju, "${candidate.nama}" (paling lama di ${prevKamar}) otomatis jadi ketua kamar itu.`
        : `Tidak ada penghuni lain di ${prevKamar} untuk dijadikan ketua.`;

      confirmDialog.ask({
        title: 'Ketua kamar akan pindah',
        message: `"${santri.nama}" ketua di ${prevKamar}. Setelah pindah ke ${kamar.nama}, jabatan ketua di kamar lama kosong. ${candidateLine}`,
        confirmLabel: candidate ? 'Ya, pindahkan & ganti ketua' : 'Ya, pindahkan',
        destructive: false,
        onConfirm: () =>
          void handleAddSantriToKamar(santriId, {
            moveKamar: true,
            autoPromoteKetua: Boolean(candidate),
          }),
      });
      return;
    }

    if (moving) {
      confirmDialog.ask({
        message: `Pindahkan "${santri.nama}" dari ${prevKamar} ke ${kamar.nama}? Hitungan lama di kamar baru dimulai lagi.`,
        confirmLabel: 'Ya, pindahkan',
        destructive: false,
        onConfirm: () => void handleAddSantriToKamar(santriId, { moveKamar: true }),
      });
      return;
    }

    confirmDialog.ask({
      message: `Tambahkan "${santri.nama}" ke ${kamar.nama}?`,
      confirmLabel: 'Ya, tambahkan',
      destructive: false,
      onConfirm: () => void handleAddSantriToKamar(santriId),
    });
  };

  const handleRemoveSantriFromKamar = async (santriId: string) => {
    if (!kamar) return;
    try {
      const res = await fetch(`/api/santri/${santriId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kamar: '' }),
      });
      if (!res.ok) throw new Error('failed');
      toast.success('Santri dikeluarkan dari kamar');
      invalidate();
    } catch {
      toast.error('Gagal mengeluarkan santri dari kamar');
    }
  };

  const handleMoveSantri = async (santriId: string, targetKamarNama: string) => {
    try {
      const res = await fetch(`/api/santri/${santriId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kamar: targetKamarNama, move_kamar: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || 'Gagal memindahkan santri');
        return;
      }
      toast.success('Santri berhasil dipindah — hitungan lama di kamar direset');
      invalidate();
      setMovePickerSantriId(null);
    } catch {
      toast.error('Gagal memindahkan santri');
    }
  };

  const addSantriPickerOptions = useMemo((): BottomPickerOption[] => {
    if (!kamar) return [];
    const currentNama = kamar.nama.trim();
    return (santriList as { id: string; nama: string; kelas?: string; kamar?: string }[])
      .filter((s) => (s.kamar ?? '').trim() !== currentNama)
      .map((s) => {
        const prevKamar = (s.kamar ?? '').trim();
        const isKetua = isSantriKetuaOfKamar(s, kamarList);
        let badge: string | undefined;
        let badgeTone: 'amber' | 'violet' | undefined;
        if (isKetua && prevKamar) {
          badge = 'Ketua';
          badgeTone = 'amber';
        } else if (prevKamar) {
          badge = 'Pindah';
          badgeTone = 'violet';
        }
        return {
          value: s.id,
          label: s.nama,
          sublabel: prevKamar
            ? `${s.kelas || '-'} · dari ${prevKamar}`
            : `${s.kelas || '-'} · belum punya kamar`,
          badge,
          badgeTone,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'id'));
  }, [kamar, santriList, kamarList]);

  const moveTargetOptions = useMemo(() => {
    if (!kamar) return [];
    return kamarList
      .filter((k) => k.id !== kamar.id)
      .filter((k) => {
        const terisi = k.terisi ?? (k.santriList?.length ?? 0);
        const kap = k.kapasitas || 4;
        return terisi < kap;
      })
      .map((k) => {
        const terisi = k.terisi ?? k.santriList?.length ?? 0;
        return {
          value: k.nama,
          label: k.nama,
          sublabel: `${k.lantai || '-'} · ${terisi}/${k.kapasitas || 4}`,
        };
      });
  }, [kamar, kamarList]);

  const fasilitasList = useMemo(() => {
    const rows = kamar?.fasilitas ?? [];
    return [...rows].sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [kamar?.fasilitas]);

  const openAddModal = useCallback(() => setShowSantriModal(true), []);

  const openAddFasilitasModal = useCallback(() => {
    setEditingFasilitas(null);
    setFasilitasForm(emptyFasilitasForm);
    setShowFasilitasModal(true);
  }, []);

  const openEditFasilitas = (row: KamarFasilitasRow) => {
    setEditingFasilitas(row);
    setFasilitasForm({
      nama: row.nama,
      tanggal: row.tanggal.slice(0, 10),
      keterangan: row.keterangan || '',
    });
    setShowFasilitasModal(true);
  };

  const closeFasilitasModal = () => {
    setShowFasilitasModal(false);
    setEditingFasilitas(null);
    setFasilitasForm(emptyFasilitasForm);
  };

  const handleSaveFasilitas = async () => {
    if (!kamar) return;
    if (!fasilitasForm.nama.trim() || !fasilitasForm.tanggal) {
      toast.error('Nama dan tanggal fasilitas wajib diisi');
      return;
    }
    setFasilitasSaving(true);
    try {
      const payload = {
        nama: fasilitasForm.nama.trim(),
        tanggal: fasilitasForm.tanggal,
        keterangan: fasilitasForm.keterangan.trim(),
      };
      const url = editingFasilitas
        ? `/api/kamar/${kamar.id}/fasilitas/${editingFasilitas.id}`
        : `/api/kamar/${kamar.id}/fasilitas`;
      const res = await fetch(url, {
        method: editingFasilitas ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || 'Gagal menyimpan fasilitas');
        return;
      }
      toast.success(editingFasilitas ? 'Fasilitas diperbarui' : 'Fasilitas ditambahkan');
      invalidate();
      closeFasilitasModal();
    } catch {
      toast.error('Gagal menyimpan fasilitas');
    } finally {
      setFasilitasSaving(false);
    }
  };

  const handleDeleteFasilitas = (row: KamarFasilitasRow) => {
    if (!kamar) return;
    confirmDialog.ask({
      message: `Hapus fasilitas "${row.nama}"?`,
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        const res = await fetch(`/api/kamar/${kamar.id}/fasilitas/${row.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          toast.error('Gagal menghapus fasilitas');
          return;
        }
        toast.success('Fasilitas dihapus');
        invalidate();
      },
    });
  };

  const headerAddAction = useMemo(() => {
    if (!kamar) return null;
    if (detailTab === 'penempatan' && !isFull) {
      return <HeaderAddButton onClick={openAddModal} label="Tambah santri ke kamar" />;
    }
    if (detailTab === 'fasilitas') {
      return <HeaderAddButton onClick={openAddFasilitasModal} label="Tambah fasilitas" />;
    }
    return null;
  }, [detailTab, isFull, kamar, openAddFasilitasModal, openAddModal]);

  useScreenHeaderActions(kamarId && kamar && kamarReady ? headerAddAction : null, [
    kamarId,
    kamar,
    kamarReady,
    headerAddAction,
    detailTab,
  ]);

  if (!kamarId) {
    return <EmptyState icon={CircleAlert} title="Halaman tidak valid" variant="inline" />;
  }

  if (kamarReady && !kamar) {
    return (
      <EmptyState icon={BedDouble} title="Kamar tidak ditemukan" description="Kembali ke daftar kamar." variant="inline" />
    );
  }

  const renderSantriCard = (
    santri: { id: string; nama: string; kelas?: string; masuk_kamar_sejak?: string },
    opts: { isKetua?: boolean }
  ) => {
    const medis = (
      santriList as { id: string; catatan_medis?: string }[]
    ).find((s) => s.id === santri.id)?.catatan_medis?.trim();

    return (
    <div
      key={santri.id}
      className={cn(appCardClass, 'p-3 space-y-2')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          <div
            className={`w-8 h-8 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0 ${
              opts.isKetua ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {opts.isKetua ? <Crown className="w-4 h-4" /> : santri.nama.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
              {santri.nama}
              {opts.isKetua ? (
                <span className="ml-1.5 text-[9px] font-bold text-amber-600">Ketua</span>
              ) : null}
            </p>
            <p className={`text-[10px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
              Kelas {santri.kelas || '-'}
            </p>
            <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              Di kamar ini:{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatLamaDiKamar(santri.masuk_kamar_sejak)}
              </span>
            </p>
            {medis ? (
              <p className={`text-[10px] mt-1 line-clamp-2 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                Medis: {medis}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700">
        {!opts.isKetua ? (
          <button
            type="button"
            onClick={() =>
              confirmDialog.ask({
                message: `Jadikan "${santri.nama}" ketua kamar?`,
                confirmLabel: 'Ya, Tetapkan',
                destructive: false,
                onConfirm: () => handleSetKetua(santri.id),
              })
            }
            className="flex-1 min-w-[7rem] py-2 text-[10px] font-bold rounded-sm bg-amber-50 text-amber-800 border border-amber-200"
          >
            Jadikan ketua
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setChangeKetuaOpen(true)}
            className="flex-1 min-w-[7rem] py-2 text-[10px] font-bold rounded-sm bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center justify-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Ganti ketua
          </button>
        )}
        <button
          type="button"
          disabled={moveTargetOptions.length === 0}
          onClick={() => setMovePickerSantriId(santri.id)}
          className="flex-1 min-w-[7rem] py-2 text-[10px] font-bold rounded-sm bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-40 inline-flex items-center justify-center gap-1"
        >
          <ArrowRightLeft className="w-3 h-3" />
          Pindah
        </button>
        <button
          type="button"
          onClick={() =>
            confirmDialog.ask({
              message: `Keluarkan "${santri.nama}" dari kamar ini?`,
              confirmLabel: 'Ya, Keluarkan',
              onConfirm: () => handleRemoveSantriFromKamar(santri.id),
            })
          }
          className="p-2 rounded-sm bg-red-50 text-red-600 border border-red-100"
          title="Keluarkan dari kamar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    );
  };

  return (
    <PageWithPullRefresh keys={['kamar', 'santri', 'dashboard']} className="space-y-4">
      {kamar ? (
        <div className={cn(appCardClass, 'p-4')}>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">
            {kamar.nama}
          </h2>
          <p className={`text-[11px] mt-1 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            {kamar.lantai || '-'} · Kapasitas {santriInKamar.length}/{kapasitas}
            {kamar.ketua ? ` · Ketua: ${kamar.ketua}` : ''}
          </p>
        </div>
      ) : null}

      <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-800/80 rounded-sm border border-transparent dark:border-slate-700">
        <button
          type="button"
          onClick={() => setDetailTab('penempatan')}
          className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${
            detailTab === 'penempatan'
              ? 'bg-card text-card-foreground border border-border shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Penempatan
        </button>
        <button
          type="button"
          onClick={() => setDetailTab('fasilitas')}
          className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${
            detailTab === 'fasilitas'
              ? 'bg-card text-card-foreground border border-border shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Fasilitas
        </button>
      </div>

      {detailTab === 'penempatan' ? (
        !kamarReady ? (
        <ListSkeleton rows={4} />
      ) : santriInKamar.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Kamar masih kosong"
          description="Ketuk + di header untuk menambahkan santri yang belum punya kamar."
        />
      ) : (
        <div className="space-y-2">
          {!ketuaSantri && santriInKamar.length > 0 ? (
            <button
              type="button"
              onClick={() => setChangeKetuaOpen(true)}
              className="w-full py-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-sm"
            >
              Pilih ketua kamar
            </button>
          ) : null}
          {ketuaSantri ? renderSantriCard(ketuaSantri, { isKetua: true }) : null}
          {anggotaLain.map((s) => renderSantriCard(s, { isKetua: false }))}
        </div>
      )
      ) : fasilitasList.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Belum ada fasilitas"
          description="Ketuk + di header untuk mencatat AC, lemari, kasur, dan tanggal pemasangannya."
        />
      ) : (
        <div className="space-y-2">
          {fasilitasList.map((row) => (
            <div key={row.id} className={cn(appCardClass, 'p-3')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                    {row.nama}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    Sejak {formatTanggalFasilitas(row.tanggal)} ·{' '}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatUsiaFasilitas(row.tanggal)}
                    </span>
                  </p>
                  {row.keterangan ? (
                    <p className={`text-[10px] mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                      {row.keterangan}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditFasilitas(row)}
                    className={`p-1.5 rounded-sm ${theme === 'dark' ? 'text-blue-400 hover:bg-slate-700' : 'text-blue-600 hover:bg-blue-50'}`}
                    title="Ubah"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteFasilitas(row)}
                    className={`p-1.5 rounded-sm ${theme === 'dark' ? 'text-red-400 hover:bg-slate-700' : 'text-red-600 hover:bg-red-50'}`}
                    title="Hapus"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AppModal
        open={showFasilitasModal}
        onClose={closeFasilitasModal}
        title={editingFasilitas ? 'Ubah Fasilitas' : 'Tambah Fasilitas'}
        description={kamar?.nama}
        className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
      >
        <div className="space-y-3 -mx-1">
          <div>
            <label className={appLabelThemed(theme)}>Nama fasilitas *</label>
            <input
              type="text"
              value={fasilitasForm.nama}
              onChange={(e) => setFasilitasForm({ ...fasilitasForm, nama: e.target.value })}
              placeholder="Misal: AC, Lemari, Kasur"
              className={appFieldThemed(theme)}
            />
          </div>
          <div>
            <label className={appLabelThemed(theme)}>Tanggal fasilitas *</label>
            <input
              type="date"
              value={fasilitasForm.tanggal}
              onChange={(e) => setFasilitasForm({ ...fasilitasForm, tanggal: e.target.value })}
              className={appFieldThemed(theme)}
            />
            <p className={`text-[10px] mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              Tanggal pemasangan atau mulai dipakai — untuk hitung sudah berapa lama.
            </p>
          </div>
          <div>
            <label className={appLabelThemed(theme)}>Keterangan</label>
            <textarea
              value={fasilitasForm.keterangan}
              onChange={(e) => setFasilitasForm({ ...fasilitasForm, keterangan: e.target.value })}
              rows={2}
              placeholder="Merek, kondisi, catatan servis, dll. (opsional)"
              className={`${appTextareaClass} ${appFieldThemed(theme)} min-h-[4rem]`}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5 pb-1">
          <Button type="button" variant="outline" className="flex-1" onClick={closeFasilitasModal}>
            Batal
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={fasilitasSaving}
            onClick={() => void handleSaveFasilitas()}
          >
            <Save className="w-4 h-4" />
            Simpan
          </Button>
        </div>
      </AppModal>

      <BottomPicker
        open={showSantriModal}
        onClose={() => setShowSantriModal(false)}
        title="Tambah Santri ke Kamar"
        description={
          kamar
            ? `${kamar.nama} · cari santri; tag Pindah/Ketua = pindah dari kamar lain`
            : undefined
        }
        searchPlaceholder="Cari nama santri..."
        options={addSantriPickerOptions}
        value=""
        onSelect={(id) => requestAddSantriToKamar(id)}
      />

      <AppModal
        open={changeKetuaOpen}
        onClose={() => setChangeKetuaOpen(false)}
        title="Pilih Ketua Kamar"
        description={kamar?.nama}
        className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
      >
        <div className="space-y-2 -mx-1 max-h-[55vh] overflow-y-auto">
          {santriInKamar.map((santri) => (
            <button
              key={santri.id}
              type="button"
              onClick={() => handleSetKetua(santri.id)}
              className={`w-full p-3 rounded-sm border text-left flex items-center gap-2 ${
                theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Crown className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-medium">{santri.nama}</span>
            </button>
          ))}
        </div>
      </AppModal>

      <BottomPicker
        open={movePickerSantriId !== null}
        onClose={() => setMovePickerSantriId(null)}
        title="Pindah ke kamar"
        description="Hitungan lama di kamar akan direset di kamar baru"
        searchPlaceholder="Cari kamar..."
        options={moveTargetOptions}
        value=""
        onSelect={(nama) => {
          if (movePickerSantriId) void handleMoveSantri(movePickerSantriId, nama);
        }}
      />

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
    </PageWithPullRefresh>
  );
}
