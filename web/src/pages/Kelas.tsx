import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { Edit2, Trash2, Save, GraduationCap } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderAddButton } from '@/components/header-action-button';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { AppModal } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { appFieldClass, appLabelClass } from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { toast } from '@/lib/toast';

type KelasRow = { id: string; nama: string; tingkat: string };

export default function Kelas() {
  const location = useLocation();
  const isKelasScreen = location.pathname === '/master/kelas';
  const reload = useAppReload();

  const [showModal, setShowModal] = useState(false);
  const [editingKelas, setEditingKelas] = useState<KelasRow | null>(null);
  const [formData, setFormData] = useState({ nama: '', tingkat: '' });
  const confirmDialog = useConfirmDialog();

  const kelasReady = useReloadKeyReady('kelas');
  const kelasList = useAppStore((s) => s.kelas) as KelasRow[];

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingKelas) {
        const res = await fetch(`/api/kelas/${editingKelas.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (!res.ok) throw new Error('fail');
        return res.json();
      }
      const res = await fetch('/api/kelas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('fail');
      return res.json();
    },
    onSuccess: () => {
      toast.success(
        editingKelas ? 'Kelas berhasil diperbarui' : 'Kelas berhasil ditambahkan'
      );
      void reload('kelas');
      handleCloseModal();
    },
    onError: () => toast.error('Gagal menyimpan data kelas'),
  });

  const handleSave = () => {
    if (!formData.nama || !formData.tingkat) {
      toast.error('Nama dan tingkat kelas harus diisi');
      return;
    }
    saveMutation.mutate();
  };

  const handleEdit = (kelas: KelasRow) => {
    setEditingKelas(kelas);
    setFormData({ nama: kelas.nama, tingkat: kelas.tingkat });
    setShowModal(true);
  };

  const requestDeleteKelas = (kelas: KelasRow) => {
    confirmDialog.ask({
      message: `Hapus kelas "${kelas.nama}"? Santri yang memakai kelas ini tidak ikut terhapus.`,
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/kelas/${kelas.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('delete failed');
          toast.success('Kelas berhasil dihapus');
          void reload('kelas');
        } catch {
          toast.error('Gagal menghapus kelas');
        }
      },
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingKelas(null);
    setFormData({ nama: '', tingkat: '' });
  };

  const openAddModal = useCallback(() => setShowModal(true), []);

  const headerAddAction = useMemo(
    () => <HeaderAddButton onClick={openAddModal} label="Tambah kelas" />,
    [openAddModal]
  );

  useScreenHeaderActions(isKelasScreen ? headerAddAction : null, [isKelasScreen, headerAddAction]);

  return (
    <PageWithPullRefresh keys={['kelas', 'santri']} className="space-y-3">
      <div className="space-y-2">
        {!kelasReady ? (
          <ListSkeleton rows={5} />
        ) : kelasList.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Belum ada data kelas"
            description="Klik tombol + untuk menambahkan"
          />
        ) : (
          kelasList.map((kelas) => (
            <div
              key={kelas.id}
              className={cn(appCardClass, 'p-4 hover:border-emerald-300 dark:hover:border-emerald-600/50 transition-all')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-900 mb-1">{kelas.nama}</h3>
                  <p className="text-xs text-slate-500">Tingkat: {kelas.tingkat}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEdit(kelas)}
                    className="p-2 rounded-sm bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteKelas(kelas)}
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
        title={editingKelas ? 'Ubah Kelas' : 'Tambah Kelas'}
      >
        <div className="space-y-3 -mx-1">
          <div>
            <label className={appLabelClass}>Nama Kelas</label>
            <input
              type="text"
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              placeholder="Contoh: 10 IPA 1"
              className={appFieldClass}
            />
          </div>
          <div>
            <label className={appLabelClass}>Tingkat</label>
            <input
              type="text"
              value={formData.tingkat}
              onChange={(e) => setFormData({ ...formData, tingkat: e.target.value })}
              placeholder="Contoh: X / 10"
              className={appFieldClass}
            />
          </div>
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
