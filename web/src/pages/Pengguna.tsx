import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Capacitor } from '@capacitor/core';
import {
  Camera,
  Edit2,
  ImagePlus,
  Trash2,
  Save,
  UserCog,
  ShieldCheck,
  KeyRound,
  Wallet,
  X,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRowActions } from '@/components/list-row-actions';
import { useScreenAddAction } from '@/lib/screen-header-actions';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { AppModal, AppModalFooter } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  avatarInitials,
  fileToAvatarDataUrl,
  getAvatar,
  setAvatar,
  subscribeAvatar,
} from '@/lib/app-avatar';
import { appFieldClass, appLabelClass, appSelectClass } from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { toast } from '@/lib/toast';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  clampPinInput,
  getSessionUser,
  pinLengthError,
  sessionUserFromPengguna,
  setSessionUser,
} from '@/lib/app-auth';
import {
  MODUL_AKSES_OPTIONS,
  PENGGUNA_ROLE_OPTIONS,
  penggunaRoleLabel,
  type Asrama,
  type ModulAkses,
  type Pengguna,
  type PenggunaRole,
} from '@/lib/app-settings';

type PenggunaPublic = Omit<Pengguna, 'pinHash'>;

type FormState = {
  nama: string;
  pin: string;
  role: PenggunaRole;
  asramaIds: string[];
  akses: ModulAkses[];
  aktif: boolean;
};

const emptyForm: FormState = {
  nama: '',
  pin: '',
  role: 'pengawas',
  asramaIds: [],
  akses: [],
  aktif: true,
};

function PenggunaListAvatar({ id, nama }: { id: string; nama: string }) {
  const [src, setSrc] = useState<string | null>(() => getAvatar(id));
  useEffect(() => subscribeAvatar(() => setSrc(getAvatar(id))), [id]);
  return (
    <span className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-emerald-600 text-white flex items-center justify-center text-sm font-black">
      {src ? (
        <img src={src} alt={nama} className="w-full h-full object-cover" />
      ) : (
        avatarInitials(nama)
      )}
    </span>
  );
}

export default function PenggunaPage() {
  const location = useLocation();
  const isScreen = location.pathname === '/master/pengguna';
  const confirmDialog = useConfirmDialog();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNative = Capacitor.isNativePlatform();

  const [items, setItems] = useState<PenggunaPublic[] | null>(null);
  const [asramaList, setAsramaList] = useState<Asrama[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PenggunaPublic | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [fotoDraft, setFotoDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([fetch('/api/pengguna'), fetch('/api/asrama')]);
      if (!u.ok) throw new Error('fail');
      setItems((await u.json()) as PenggunaPublic[]);
      if (a.ok) setAsramaList((await a.json()) as Asrama[]);
    } catch {
      toast.error('Gagal memuat akun');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
    setFotoDraft('');
  };

  const toggleInList = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const pickFotoNative = async (source: 'camera' | 'gallery') => {
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import(
        '@capacitor/camera'
      );
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });
      if (photo.dataUrl) {
        // Kompres ulang lewat canvas agar ukuran seragam dengan avatar profil.
        const blob = await (await fetch(photo.dataUrl)).blob();
        const file = new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' });
        setFotoDraft(await fileToAvatarDataUrl(file));
      }
    } catch (err) {
      // User batal / izin ditolak — diam.
      console.warn('Ambil foto gagal:', err);
    }
  };

  const pickFotoFile = async (file: File | null) => {
    if (!file) return;
    try {
      setFotoDraft(await fileToAvatarDataUrl(file));
    } catch {
      toast.error('Gagal memproses foto');
    }
  };

  const handleSave = async () => {
    if (!form.nama.trim()) {
      toast.error('Nama pengguna wajib diisi');
      return;
    }
    if (!editing) {
      const pinErr = pinLengthError(form.pin);
      if (pinErr) {
        toast.error(pinErr);
        return;
      }
    } else if (form.pin.trim()) {
      const pinErr = pinLengthError(form.pin);
      if (pinErr) {
        toast.error(pinErr);
        return;
      }
    }
    if (form.role === 'pengawas' && form.asramaIds.length !== 1) {
      toast.error('Pengawas wajib ditugaskan ke tepat 1 asrama');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nama: form.nama,
        role: form.role,
        asramaIds: form.asramaIds,
        akses: form.akses,
        aktif: form.aktif,
      };
      if (form.pin.trim()) payload.pin = form.pin.trim();
      const res = await fetch(editing ? `/api/pengguna/${editing.id}` : '/api/pengguna', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as PenggunaPublic & {
        error?: string;
        id?: string;
      };
      if (!res.ok) {
        toast.error(data.error || 'Gagal menyimpan akun');
        return;
      }
      const savedId = editing?.id ?? data.id;
      if (savedId) setAvatar(savedId, fotoDraft.trim() ? fotoDraft : null);
      const session = getSessionUser();
      if (editing && session && editing.id === session.id && data.id) {
        const nextAsramaIds = Array.isArray(data.asramaIds) ? data.asramaIds : [];
        let activeAsramaId = session.activeAsramaId;
        if (
          activeAsramaId &&
          nextAsramaIds.length > 0 &&
          data.role !== 'super_admin' &&
          !nextAsramaIds.includes(activeAsramaId)
        ) {
          activeAsramaId = nextAsramaIds[0] ?? null;
        }
        setSessionUser(
          sessionUserFromPengguna(
            {
              id: data.id,
              nama: data.nama,
              role: data.role,
              pinHash: '',
              asramaIds: nextAsramaIds,
              akses: data.akses ?? [],
              aktif: data.aktif !== false,
            },
            activeAsramaId
          )
        );
      }
      toast.success(editing ? 'Akun diperbarui' : 'Akun ditambahkan');
      closeModal();
      void load();
    } finally {
      setSaving(false);
    }
  };

  const requestResetPin = (item: PenggunaPublic) => {
    const pin = window.prompt(
      `PIN baru untuk ${item.nama} (${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit):`,
      ''
    );
    if (pin === null) return;
    const pinErr = pinLengthError(pin);
    if (pinErr) {
      toast.error(pinErr);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/pengguna/${item.id}/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Gagal mereset PIN');
        return;
      }
      toast.success(`PIN ${item.nama} direset`);
    })();
  };

  const requestDelete = (item: PenggunaPublic) => {
    confirmDialog.ask({
      message: `Hapus akun "${item.nama}"?`,
      confirmLabel: 'Ya, Hapus',
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/pengguna/${item.id}`, { method: 'DELETE' });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) {
            toast.error(data.error || 'Gagal menghapus akun');
            return;
          }
          setAvatar(item.id, null);
          toast.success('Akun dihapus');
          void load();
        } catch {
          toast.error('Gagal menghapus akun');
        }
      },
    });
  };

  const asramaName = (id: string) => asramaList.find((a) => a.id === id)?.nama ?? '?';

  const openAdd = useCallback(() => {
    setEditing(null);
    setForm(emptyForm);
    setFotoDraft('');
    setShowModal(true);
  }, []);
  const headerAddAction = useMemo(
    () => ({ onClick: openAdd, label: 'Tambah akun' }),
    [openAdd]
  );
  useScreenAddAction(isScreen ? headerAddAction : null, [isScreen, headerAddAction]);

  return (
    <PageWithPullRefresh keys={['settings']} className="space-y-3">
      <div className="space-y-2">
        {items === null ? (
          <ListSkeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="Belum ada akun"
            description="Klik tombol + untuk menambahkan"
          />
        ) : (
          items.map((p) => (
            <div key={p.id} className={cn(appCardClass, 'p-3 flex items-start gap-3')}>
              <PenggunaListAvatar id={p.id} nama={p.nama} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate flex items-center gap-1.5">
                  {p.role === 'super_admin' ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : p.role === 'bendahara' ? (
                    <Wallet className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  ) : (
                    <UserCog className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span className="truncate">{p.nama}</span>
                  {!p.aktif && (
                    <span className="ml-1 text-[9px] font-bold uppercase text-rose-500">
                      nonaktif
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500">
                  {penggunaRoleLabel(p.role)}
                  {' · '}
                  {p.role === 'super_admin'
                    ? 'Semua asrama'
                    : p.asramaIds.length
                      ? p.asramaIds.map(asramaName).join(', ')
                      : p.role === 'bendahara'
                        ? 'Semua asrama'
                        : 'Belum ada asrama'}
                </p>
                {p.role !== 'super_admin' && (
                  <p className="text-[10px] text-slate-400 truncate">
                    {p.akses.length
                      ? p.akses
                          .map((m) => MODUL_AKSES_OPTIONS.find((o) => o.id === m)?.label ?? m)
                          .join(', ')
                      : 'Tanpa akses modul'}
                  </p>
                )}
              </div>
              <ListRowActions
                title={p.nama}
                subtitle={penggunaRoleLabel(p.role)}
                actions={[
                  {
                    id: 'reset-pin',
                    label: 'Reset PIN',
                    icon: <KeyRound className="w-4 h-4 text-amber-600" />,
                    onSelect: () => requestResetPin(p),
                  },
                  {
                    id: 'edit',
                    label: 'Ubah',
                    icon: <Edit2 className="w-4 h-4 text-blue-600" />,
                    onSelect: () => {
                      setEditing(p);
                      setForm({
                        nama: p.nama,
                        pin: '',
                        role: p.role,
                        asramaIds: [...p.asramaIds],
                        akses: [...p.akses],
                        aktif: p.aktif,
                      });
                      setFotoDraft(getAvatar(p.id) ?? '');
                      setShowModal(true);
                    },
                  },
                  {
                    id: 'delete',
                    label: 'Hapus',
                    icon: <Trash2 className="w-4 h-4" />,
                    destructive: true,
                    onSelect: () => requestDelete(p),
                  },
                ]}
              />
            </div>
          ))
        )}
      </div>

      <AppModal
        open={showModal}
        onClose={closeModal}
        title={editing ? 'Edit Akun' : 'Tambah Akun'}
        footer={
          <AppModalFooter>
            <Button type="button" variant="outline" className="flex-1" onClick={closeModal}>
              Batal
            </Button>
            <Button type="button" className="flex-1" disabled={saving} onClick={() => void handleSave()}>
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </AppModalFooter>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className={appLabelClass}>Foto akun</label>
            <div className="flex items-center gap-3">
              <span className="w-14 h-14 rounded-full overflow-hidden shrink-0 bg-emerald-600 text-white flex items-center justify-center text-lg font-black">
                {fotoDraft ? (
                  <img src={fotoDraft} alt="" className="w-full h-full object-cover" />
                ) : (
                  avatarInitials(form.nama || 'A')
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                {isNative ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void pickFotoNative('camera')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold border border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/40"
                    >
                      <Camera className="w-4 h-4" />
                      Kamera
                    </button>
                    <button
                      type="button"
                      onClick={() => void pickFotoNative('gallery')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold border border-slate-200 text-slate-600 bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:bg-slate-800"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Galeri
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold border border-slate-200 text-slate-600 bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:bg-slate-800"
                  >
                    <ImagePlus className="w-4 h-4" />
                    Unggah foto
                  </button>
                )}
                {fotoDraft ? (
                  <button
                    type="button"
                    onClick={() => setFotoDraft('')}
                    className="p-2 rounded-sm text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    aria-label="Hapus foto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void pickFotoFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <p className="text-[10px] text-slate-400">
              Foto tersimpan di perangkat (sama seperti foto profil).
            </p>
          </div>
          <div className="space-y-1">
            <label className={appLabelClass}>Nama pengguna</label>
            <input
              className={appFieldClass}
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
              placeholder="cth: Ust. Ahmad"
            />
          </div>
          <div className="space-y-1">
            <label className={appLabelClass}>
              {editing
                ? 'PIN baru (kosongkan jika tidak diganti)'
                : `PIN (${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit)`}
            </label>
            <input
              className={appFieldClass}
              type="password"
              inputMode="numeric"
              maxLength={PIN_MAX_LENGTH}
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: clampPinInput(e.target.value) }))}
              placeholder="PIN unik — tidak boleh sama dengan akun lain"
            />
          </div>
          <div className="space-y-1">
            <label className={appLabelClass}>Role</label>
            <select
              className={appSelectClass}
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({ ...f, role: e.target.value as FormState['role'] }))
              }
            >
              {PENGGUNA_ROLE_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400 leading-snug">
              Pengawas hanya mengelola 1 asrama. Bendahara bebas: 1, beberapa, atau
              semua asrama (kosongkan = semua).
            </p>
          </div>
          {form.role === 'pengawas' && (
            <div className="space-y-1">
              <label className={appLabelClass}>Tugas asrama (wajib 1)</label>
              <select
                className={appSelectClass}
                value={form.asramaIds[0] ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    asramaIds: e.target.value ? [e.target.value] : [],
                  }))
                }
              >
                <option value="">Pilih asrama…</option>
                {asramaList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </select>
            </div>
          )}
          {form.role === 'bendahara' && (
            <div className="space-y-1">
              <label className={appLabelClass}>
                Tugas asrama (kosongkan = semua asrama)
              </label>
              <div className="grid grid-cols-2 gap-1">
                {asramaList.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={form.asramaIds.includes(a.id)}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          asramaIds: toggleInList(f.asramaIds, a.id),
                        }))
                      }
                    />
                    {a.nama}
                  </label>
                ))}
              </div>
            </div>
          )}
          {form.role !== 'super_admin' && (
            <div className="space-y-1">
              <label className={appLabelClass}>Hak akses modul</label>
              <div className="grid grid-cols-2 gap-1">
                {MODUL_AKSES_OPTIONS.map((o) => (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={form.akses.includes(o.id)}
                      onChange={() => setForm((f) => ({ ...f, akses: toggleInList(f.akses, o.id) }))}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={form.aktif}
              onChange={(e) => setForm((f) => ({ ...f, aktif: e.target.checked }))}
            />
            Akun aktif (bisa login)
          </label>
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
