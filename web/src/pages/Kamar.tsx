import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useAppReload } from '@/hooks/use-app-reload';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { BedDouble, Edit2, Filter, Info, Save, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { HeaderAddButton } from '@/components/header-action-button';
import { useScreenHeaderActions } from '@/lib/screen-header-actions';
import { AppModal } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { useTheme } from '../lib/theme';
import {
  appFieldThemed,
  appFormGrid2,
  appLabelThemed,
} from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { kamarDetailPath } from '@/lib/kamar-path';
import { withBackTo } from '@/lib/app-navigation';
import { KamarSlotStrip } from '@/components/kamar-slot-strip';

type KamarRow = {
  id: string;
  nama: string;
  kapasitas: number;
  lantai?: string;
  ketua?: string;
  terisi?: number;
};

export default function Kamar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isKamarScreen = location.pathname === '/master/kamar';
  const reload = useAppReload();
  const { theme } = useTheme();
  const kamarReady = useReloadKeyReady('kamar');
  const kamarList = useAppStore((s) => s.kamar) as KamarRow[];
  const [showModal, setShowModal] = useState(false);
  const [editingKamar, setEditingKamar] = useState<KamarRow | null>(null);
  const [formData, setFormData] = useState({
    nama: '',
    kapasitasInput: '4',
    lantai: 'Lantai 1',
  });

  const parseKapasitasInput = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  };
  const confirmDialog = useConfirmDialog();
  const [selectedLantaiFilter, setSelectedLantaiFilter] = useState('Semua');

  const invalidate = () => {
    void reload(['kamar', 'santri', 'dashboard']);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const kapasitas = parseKapasitasInput(formData.kapasitasInput);
      if (kapasitas === null) throw new Error('invalid kapasitas');
      if (editingKamar) {
        const res = await fetch(`/api/kamar/${editingKamar.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nama: formData.nama.trim(),
            kapasitas,
            lantai: formData.lantai,
          }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errBody?.error || 'save failed');
        }
        return res.json();
      }
      const payload = { nama: formData.nama.trim(), kapasitas, lantai: formData.lantai };
      const res = await fetch('/api/kamar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || 'save failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(editingKamar ? 'Data kamar diperbarui' : 'Kamar berhasil ditambahkan');
      invalidate();
      handleCloseModal();
    },
    onError: (err: Error) =>
      toast.error(err.message && err.message !== 'save failed' ? err.message : 'Gagal menyimpan data kamar'),
  });

  const handleSave = () => {
    if (!formData.nama.trim()) {
      toast.error('Nama kamar harus diisi');
      return;
    }
    if (parseKapasitasInput(formData.kapasitasInput) === null) {
      toast.error('Kapasitas harus angka 0 atau lebih');
      return;
    }
    saveMutation.mutate();
  };

  const handleEdit = (kamar: KamarRow) => {
    setEditingKamar(kamar);
    setFormData({
      nama: kamar.nama,
      kapasitasInput: String(kamar.kapasitas ?? 4),
      lantai: kamar.lantai || 'Lantai 1',
    });
    setShowModal(true);
  };

  const requestDeleteKamar = (id: string, nama: string) => {
    confirmDialog.ask({
      message: `Hapus kamar "${nama}"? Semua santri di kamar ini akan tidak memiliki kamar (data santri tetap ada).`,
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/kamar/${id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('delete failed');
          toast.success('Kamar dihapus');
          invalidate();
        } catch {
          toast.error('Gagal menghapus kamar');
        }
      },
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingKamar(null);
    setFormData({ nama: '', kapasitasInput: '4', lantai: 'Lantai 1' });
  };

  const lantaiFilters = useMemo(() => {
    const floors = Array.from(
      new Set(kamarList.map((k) => k.lantai).filter((l): l is string => Boolean(l?.trim())))
    ).sort((a, b) => a.localeCompare(b, 'id'));
    return ['Semua', ...floors];
  }, [kamarList]);

  const filteredKamarList = useMemo(
    () =>
      kamarList.filter(
        (k) => selectedLantaiFilter === 'Semua' || (k.lantai || '') === selectedLantaiFilter
      ),
    [kamarList, selectedLantaiFilter]
  );

  const openAddKamarModal = useCallback(() => setShowModal(true), []);

  const headerAddAction = useMemo(
    () => <HeaderAddButton onClick={openAddKamarModal} label="Tambah kamar" />,
    [openAddKamarModal]
  );

  useScreenHeaderActions(isKamarScreen ? headerAddAction : null, [isKamarScreen, headerAddAction]);

  return (
    <>
    <PageWithPullRefresh keys={['kamar', 'santri']} className="space-y-3">
      {lantaiFilters.length > 1 ? (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {lantaiFilters.map((lantai) => {
            const isSelected = selectedLantaiFilter === lantai;
            return (
              <button
                key={lantai}
                type="button"
                onClick={() => setSelectedLantaiFilter(lantai)}
                className={`whitespace-nowrap px-2.5 py-1 rounded-sm text-xs font-bold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : theme === 'dark'
                      ? 'bg-slate-800 text-slate-300 border border-slate-700'
                      : 'bg-slate-50 text-slate-600 border border-slate-200/70'
                }`}
              >
                {lantai}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {!kamarReady ? (
          <ListSkeleton rows={5} className="px-0.5" />
        ) : kamarList.length === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="Belum ada kamar"
            description="Ketuk + di header untuk menambahkan kamar baru."
            variant="inline"
            dark={theme === 'dark'}
          />
        ) : filteredKamarList.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="Tidak ada kamar di filter ini"
            description="Pilih lantai lain atau hapus filter."
            variant="inline"
            dark={theme === 'dark'}
          />
        ) : (
          filteredKamarList.map((kamar) => {
            const terisi = kamar.terisi ?? 0;
            const kapasitas = kamar.kapasitas || 4;
            const goDetail = () =>
              navigate(kamarDetailPath(kamar.id), withBackTo('/master/kamar'));

            return (
              <div
                key={kamar.id}
                role="button"
                tabIndex={0}
                onClick={goDetail}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goDetail();
                  }
                }}
                className={cn(
                  appCardClass,
                  'px-2.5 py-2.5 flex items-center gap-2 cursor-pointer active:opacity-90'
                )}
              >
                <div className="min-w-0 flex-1 text-left">
                  <h3
                    className="text-xs font-bold truncate text-slate-900 dark:text-slate-50"
                  >
                    {kamar.nama}
                  </h3>
                  <p className={`text-[10px] truncate ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {kamar.lantai || '-'} · {terisi}/{kapasitas} jiwa
                    {kamar.ketua ? ` · Ketua: ${kamar.ketua}` : ''}
                  </p>
                  <div className="mt-2">
                    <KamarSlotStrip terisi={terisi} kapasitas={kapasitas} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goDetail();
                  }}
                  className={`p-1.5 rounded-sm shrink-0 ${
                    theme === 'dark'
                      ? 'text-slate-300 hover:bg-slate-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  aria-label={`Info kamar ${kamar.nama}`}
                  title="Info kamar"
                >
                  <Info className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(kamar);
                  }}
                  className={`p-1.5 rounded-sm shrink-0 ${theme === 'dark' ? 'text-blue-400 hover:bg-slate-700' : 'text-blue-600 hover:bg-blue-50'}`}
                  title="Ubah nama"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    requestDeleteKamar(kamar.id, kamar.nama);
                  }}
                  className={`p-1.5 rounded-sm shrink-0 ${theme === 'dark' ? 'text-red-400 hover:bg-slate-700' : 'text-red-600 hover:bg-red-50'}`}
                  title="Hapus"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </PageWithPullRefresh>

      <AppModal
        open={showModal}
        onClose={handleCloseModal}
        title={editingKamar ? 'Ubah Kamar' : 'Tambah Kamar'}
        className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
      >
        <div className="space-y-3 -mx-1">
          <div>
            <label className={appLabelThemed(theme)}>Nama Kamar</label>
            <input
              type="text"
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              placeholder="Contoh: Kamar 1 (Al-Fatih)"
              className={appFieldThemed(theme)}
            />
          </div>
          <div className={appFormGrid2}>
            <div className="min-w-0">
              <label className={appLabelThemed(theme)}>Kapasitas</label>
              <input
                type="number"
                inputMode="numeric"
                value={formData.kapasitasInput}
                onChange={(e) => setFormData({ ...formData, kapasitasInput: e.target.value })}
                min={0}
                step={1}
                placeholder="0"
                className={appFieldThemed(theme)}
              />
            </div>
            <div className="min-w-0">
              <label className={appLabelThemed(theme)}>Lantai</label>
              <select
                value={formData.lantai}
                onChange={(e) => setFormData({ ...formData, lantai: e.target.value })}
                className={appFieldThemed(theme)}
              >
                <option value="Lantai 1">Lantai 1</option>
                <option value="Lantai 2">Lantai 2</option>
                <option value="Lantai 3">Lantai 3</option>
              </select>
            </div>
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
        className={theme === 'dark' ? 'bg-slate-800 text-white' : ''}
      />
    </>
  );
}
