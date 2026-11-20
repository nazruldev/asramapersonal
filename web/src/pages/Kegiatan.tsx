import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { Edit2, Trash2, Save, CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderAddButton } from '@/components/header-action-button';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { AppModal } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { toast } from '@/lib/toast';
import {
  ALL_DAYS,
  formatHariAktif,
  formatWaktuKegiatan,
  HARI_LABELS,
  sortKegiatanForAbsensi,
  type KegiatanSchedule,
} from '@/lib/kegiatan-schedule';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import {
  appFieldClass,
  appFormGrid2,
  appLabelClass,
  appSelectClass,
} from '@/lib/form-styles';
import { KegiatanMark } from '@/components/kegiatan-mark';

type KegiatanForm = {
  nama: string;
  jenis: string;
  icon: string;
  jam_mulai: string;
  jam_selesai: string;
  hari_aktif: number[];
  urutan: string;
  untuk_absensi: boolean;
};

const emptyForm = (): KegiatanForm => ({
  nama: '',
  jenis: '',
  icon: '',
  jam_mulai: '',
  jam_selesai: '',
  hari_aktif: [...ALL_DAYS],
  urutan: '',
  untuk_absensi: true,
});

function formFromKegiatan(kegiatan: KegiatanSchedule): KegiatanForm {
  const hari =
    kegiatan.hari_aktif && kegiatan.hari_aktif.length > 0 ? [...kegiatan.hari_aktif] : [...ALL_DAYS];
  return {
    nama: kegiatan.nama,
    jenis: kegiatan.jenis,
    icon: kegiatan.icon ?? '',
    jam_mulai: kegiatan.jam_mulai ?? '',
    jam_selesai: kegiatan.jam_selesai ?? '',
    hari_aktif: hari,
    urutan: kegiatan.urutan != null ? String(kegiatan.urutan) : '',
    untuk_absensi: kegiatan.untuk_absensi !== false,
  };
}

function payloadFromForm(form: KegiatanForm) {
  const hariAktif =
    form.hari_aktif.length === 7 || form.hari_aktif.length === 0 ? ALL_DAYS : form.hari_aktif;
  const jam_mulai = form.jam_mulai.trim();
  const jam_selesai = form.jam_selesai.trim();
  const urutan = form.urutan.trim() ? Number(form.urutan) : undefined;
  return {
    nama: form.nama.trim(),
    jenis: form.jenis,
    icon: form.icon.trim() || undefined,
    jam_mulai: jam_mulai || undefined,
    jam_selesai: jam_selesai || undefined,
    waktu: formatWaktuKegiatan(jam_mulai, jam_selesai) || undefined,
    hari_aktif: hariAktif,
    urutan,
    untuk_absensi: form.untuk_absensi,
  };
}

export default function Kegiatan() {
  const location = useLocation();
  const isKegiatanScreen = location.pathname === '/master/kegiatan';
  const reload = useAppReload();

  const [showModal, setShowModal] = useState(false);
  const [editingKegiatan, setEditingKegiatan] = useState<KegiatanSchedule | null>(null);
  const [formData, setFormData] = useState<KegiatanForm>(emptyForm());
  const confirmDialog = useConfirmDialog();

  const kegiatanReady = useReloadKeyReady('kegiatan');
  const kegiatanList = sortKegiatanForAbsensi(
    useAppStore((s) => s.kegiatan) as KegiatanSchedule[]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = payloadFromForm(formData);
      if (editingKegiatan) {
        const res = await fetch(`/api/kegiatan/${editingKegiatan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('fail');
        return res.json();
      }
      const res = await fetch('/api/kegiatan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('fail');
      return res.json();
    },
    onSuccess: () => {
      toast.success(
        editingKegiatan ? 'Kegiatan berhasil diperbarui' : 'Kegiatan berhasil ditambahkan'
      );
      void reload('kegiatan');
      handleCloseModal();
    },
    onError: () => toast.error('Gagal menyimpan data kegiatan'),
  });

  const toggleHari = (index: number) => {
    setFormData((prev) => {
      const has = prev.hari_aktif.includes(index);
      const next = has
        ? prev.hari_aktif.filter((d) => d !== index)
        : [...prev.hari_aktif, index].sort((a, b) => a - b);
      return { ...prev, hari_aktif: next.length === 0 ? [index] : next };
    });
  };

  const handleSave = () => {
    if (!formData.nama.trim() || !formData.jenis) {
      toast.error('Nama dan jenis kegiatan harus diisi');
      return;
    }
    saveMutation.mutate();
  };

  const handleEdit = (kegiatan: KegiatanSchedule) => {
    setEditingKegiatan(kegiatan);
    setFormData(formFromKegiatan(kegiatan));
    setShowModal(true);
  };

  const requestDeleteKegiatan = (kegiatan: KegiatanSchedule) => {
    confirmDialog.ask({
      message: `Hapus kegiatan "${kegiatan.nama}"?`,
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/kegiatan/${kegiatan.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('delete failed');
          toast.success('Kegiatan berhasil dihapus');
          void reload('kegiatan');
        } catch {
          toast.error('Gagal menghapus kegiatan');
        }
      },
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingKegiatan(null);
    setFormData(emptyForm());
  };

  const openAddModal = useCallback(() => setShowModal(true), []);

  const headerAddAction = useMemo(
    () => <HeaderAddButton onClick={openAddModal} label="Tambah kegiatan" />,
    [openAddModal]
  );

  useScreenHeaderActions(isKegiatanScreen ? headerAddAction : null, [
    isKegiatanScreen,
    headerAddAction,
  ]);

  return (
    <PageWithPullRefresh keys={['kegiatan']} className="space-y-3">
      <div className="space-y-2">
        {!kegiatanReady ? (
          <ListSkeleton rows={5} />
        ) : kegiatanList.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Belum ada data kegiatan"
            description="Ketuk + di header untuk menambahkan kegiatan absensi."
          />
        ) : (
          kegiatanList.map((kegiatan) => (
            <div
              key={kegiatan.id}
              className={cn(appCardClass, 'p-4 hover:border-emerald-300 dark:hover:border-emerald-600/50 transition-all')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <KegiatanMark nama={kegiatan.nama} icon={kegiatan.icon} />
                    <span className="truncate">{kegiatan.nama}</span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>Jenis: {kegiatan.jenis}</span>
                    {(kegiatan.waktu || kegiatan.jam_mulai) && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span>
                          {kegiatan.waktu ||
                            formatWaktuKegiatan(kegiatan.jam_mulai, kegiatan.jam_selesai)}
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-emerald-700/90 mt-1.5 font-medium">
                    {formatHariAktif(kegiatan.hari_aktif)}
                    {kegiatan.untuk_absensi === false ? ' · tidak di absensi' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(kegiatan)}
                    className="p-2 rounded-sm bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteKegiatan(kegiatan)}
                    className="p-2 rounded-sm bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <AppModal
        open={showModal}
        onClose={handleCloseModal}
        title={editingKegiatan ? 'Ubah Kegiatan' : 'Tambah Kegiatan'}
      >
        <div className="space-y-3 -mx-1 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <label className={appLabelClass}>Nama Kegiatan</label>
            <input
              type="text"
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              placeholder="Contoh: Masuk Asrama"
              className={appFieldClass}
            />
          </div>
          <div className={appFormGrid2}>
            <div className="min-w-0">
              <label className={appLabelClass}>Singkatan (opsional)</label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="SB"
                maxLength={2}
                className={appFieldClass}
              />
            </div>
            <div className="min-w-0">
              <label className={appLabelClass}>Urutan</label>
              <input
                type="number"
                min={1}
                value={formData.urutan}
                onChange={(e) => setFormData({ ...formData, urutan: e.target.value })}
                placeholder="1"
                className={appFieldClass}
              />
            </div>
          </div>
          <div>
            <label className={appLabelClass}>Jenis Kegiatan</label>
            <select
              value={formData.jenis}
              onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
              className={appSelectClass}
            >
              <option value="">Pilih jenis</option>
              <option value="Ibadah">Ibadah</option>
              <option value="Belajar">Belajar</option>
              <option value="Kegiatan">Kegiatan</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>
          <div className={appFormGrid2}>
            <div className="min-w-0">
              <label className={appLabelClass}>Jam mulai absen</label>
              <input
                type="time"
                value={formData.jam_mulai}
                onChange={(e) => setFormData({ ...formData, jam_mulai: e.target.value })}
                className={appFieldClass}
              />
            </div>
            <div className="min-w-0">
              <label className={appLabelClass}>Jam selesai</label>
              <input
                type="time"
                value={formData.jam_selesai}
                onChange={(e) => setFormData({ ...formData, jam_selesai: e.target.value })}
                className={appFieldClass}
              />
            </div>
          </div>
          <div>
            <label className={appLabelClass}>Hari muncul di absensi</label>
            <div className="flex flex-wrap gap-1.5">
              {HARI_LABELS.map((h) => {
                const active = formData.hari_aktif.includes(h.index);
                return (
                  <button
                    key={h.index}
                    type="button"
                    onClick={() => toggleHari(h.index)}
                    className={`px-2.5 py-1.5 rounded-sm text-xs font-bold border transition-colors ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {h.short}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Contoh: Muhadarah hanya Sen & Kam — matikan hari lainnya.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.untuk_absensi}
              onChange={(e) => setFormData({ ...formData, untuk_absensi: e.target.checked })}
              className="rounded border-slate-300"
            />
            Tampilkan di halaman Absensi
          </label>
        </div>
        <div className="flex gap-2 mt-5 pb-1">
          <Button type="button" variant="outline" className="flex-1" onClick={handleCloseModal}>
            Batal
          </Button>
          <Button type="button" className="flex-1" disabled={saveMutation.isPending} onClick={handleSave}>
            <Save className="w-4 h-4" />
            Simpan
          </Button>
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
