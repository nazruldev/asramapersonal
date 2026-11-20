import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { Edit2, Trash2, Save, Building2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useScreenAddAction } from '@/lib/screen-header-actions';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { AppModal } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { appFieldClass, appLabelClass, appSelectClass } from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { toast } from '@/lib/toast';
import { JENIS_ASRAMA_OPTIONS, type Asrama } from '@/lib/app-settings';

export default function Asrama() {
  const location = useLocation();
  const isScreen = location.pathname === '/master/asrama';
  const confirmDialog = useConfirmDialog();

  const [items, setItems] = useState<Asrama[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Asrama | null>(null);
  const [form, setForm] = useState({ nama: '', jenis: '', alamat: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/asrama');
      if (!res.ok) throw new Error('fail');
      setItems((await res.json()) as Asrama[]);
    } catch {
      toast.error('Gagal memuat data asrama');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm({ nama: '', jenis: '', alamat: '' });
  };

  const handleSave = async () => {
    if (!form.nama.trim()) {
      toast.error('Nama asrama wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/asrama/${editing.id}` : '/api/asrama', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Gagal menyimpan asrama');
        return;
      }
      toast.success(editing ? 'Asrama diperbarui' : 'Asrama ditambahkan');
      closeModal();
      void load();
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (item: Asrama) => {
    confirmDialog.ask({
      message: `Hapus asrama "${item.nama}"? Gagal jika masih dipakai santri/kamar.`,
      confirmLabel: 'Ya, Hapus',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/asrama/${item.id}`, { method: 'DELETE' });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            toast.error(data.error || 'Gagal menghapus asrama');
            return;
          }
          toast.success('Asrama dihapus');
          void load();
        } catch {
          toast.error('Gagal menghapus asrama');
        }
      },
    });
  };

  const openAdd = useCallback(() => setShowModal(true), []);
  const headerAddAction = useMemo(() => ({ onClick: openAdd, label: 'Tambah asrama' }), [openAdd]);
  useScreenAddAction(isScreen ? headerAddAction : null, [isScreen, headerAddAction]);

  return (
    <PageWithPullRefresh keys={['settings']} className="space-y-3">
      <div className="space-y-2">
        {items === null ? (
          <ListSkeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Belum ada asrama"
            description="Klik tombol + untuk menambahkan"
          />
        ) : (
          items.map((a) => (
            <div key={a.id} className={cn(appCardClass, 'p-3 flex items-center gap-3')}>
              <Building2 className="w-5 h-5 text-cyan-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                  {a.nama}
                </p>
                <p className="text-[11px] text-slate-500 truncate">
                  {[a.jenis, a.alamat].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(a);
                  setForm({ nama: a.nama, jenis: a.jenis ?? '', alamat: a.alamat ?? '' });
                  setShowModal(true);
                }}
                className="p-2 text-slate-400 hover:text-emerald-600"
                aria-label="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => requestDelete(a)}
                className="p-2 text-slate-400 hover:text-rose-600"
                aria-label="Hapus"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <AppModal open={showModal} onClose={closeModal} title={editing ? 'Edit Asrama' : 'Tambah Asrama'}>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className={appLabelClass}>Nama asrama</label>
            <input
              className={appFieldClass}
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
              placeholder="cth: Asrama Putra"
            />
          </div>
          <div className="space-y-1">
            <label className={appLabelClass}>Jenis</label>
            <select
              className={appSelectClass}
              value={form.jenis}
              onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
            >
              <option value="">Pilih jenis…</option>
              {JENIS_ASRAMA_OPTIONS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={appLabelClass}>Alamat (opsional)</label>
            <input
              className={appFieldClass}
              value={form.alamat}
              onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
            />
          </div>
          <Button type="button" className="w-full" disabled={saving} onClick={() => void handleSave()}>
            <Save className="w-4 h-4" />
            {saving ? 'Menyimpan…' : 'Simpan'}
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
