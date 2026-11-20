import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import {
  Camera,
  ChevronLeft,
  ImagePlus,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { normalizeAppPathname } from '@/lib/app-navigation';
import {
  clearAuthenticated,
  getSessionUser,
  markAuthenticated,
  sessionUserFromPengguna,
  setSessionUser,
} from '@/lib/app-auth';
import {
  avatarInitials,
  fileToAvatarDataUrl,
  getAvatar,
  setAvatar,
  subscribeAvatar,
} from '@/lib/app-avatar';
import { attemptAccountLogin, listLoginAccounts, type AccountOption } from '@/lib/app-login';
import {
  PENGGUNA_ROLE_OPTIONS,
  penggunaRoleLabel,
  type Asrama,
  type Pengguna,
  type PenggunaRole,
} from '@/lib/app-settings';
import { appFieldClass, appLabelClass, appSelectClass } from '@/lib/form-styles';
import { useScreenAddAction } from '@/lib/screen-header-actions';
import { appCardClass, appListCardButtonClass, appMutedTextClass } from '@/lib/surface-styles';
import { toast } from '@/lib/toast';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

function AccountAvatar({ id, nama }: { id: string; nama: string }) {
  const [avatar, setAvatarState] = useState<string | null>(() => getAvatar(id));
  useEffect(() => subscribeAvatar(() => setAvatarState(getAvatar(id))), [id]);
  return (
    <span className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-emerald-600 text-white flex items-center justify-center text-sm font-black">
      {avatar ? (
        <img src={avatar} alt={nama} className="w-full h-full object-cover" />
      ) : (
        avatarInitials(nama)
      )}
    </span>
  );
}

type CreateForm = {
  nama: string;
  pin: string;
  role: PenggunaRole;
  asramaId: string;
};

const emptyCreate: CreateForm = {
  nama: '',
  pin: '',
  role: 'pengawas',
  asramaId: '',
};

export default function GantiAkun() {
  const navigate = useNavigate();
  const location = useLocation();
  const isScreen = normalizeAppPathname(location.pathname) === '/ganti-akun';
  const reloadAll = useAppStore((s) => s.reloadAll);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNative = Capacitor.isNativePlatform();
  const session = getSessionUser();
  const canCreateLogin = session?.role === 'super_admin';

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [asramaList, setAsramaList] = useState<Asrama[]>([]);
  const [selected, setSelected] = useState<AccountOption | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [fotoDraft, setFotoDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const currentId = session?.id;

  const refreshAccounts = useCallback(() => {
    void listLoginAccounts().then(setAccounts);
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    if (!showCreate) return;
    void fetch('/api/asrama')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAsramaList(data as Asrama[]))
      .catch(() => setAsramaList([]));
  }, [showCreate]);

  const masuk = async () => {
    if (!selected) return;
    if (!pin.trim()) {
      toast.error('Masukkan PIN');
      return;
    }
    setLoading(true);
    try {
      const result = await attemptAccountLogin(selected.id, pin);
      if (!result.ok || !result.user) {
        toast.error(result.ok ? 'Gagal masuk' : result.error);
        return;
      }
      setSessionUser(sessionUserFromPengguna(result.user as Pengguna));
      markAuthenticated();
      await reloadAll();
      toast.success(`Masuk sebagai ${result.user.nama}`);
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  const keluar = () => {
    clearAuthenticated();
    window.location.reload();
  };

  const openTambahAkunLogin = useCallback(() => {
    if (!canCreateLogin) {
      toast.error('Hanya administrator yang bisa menambah akun login');
      return;
    }
    setCreateForm(emptyCreate);
    setFotoDraft('');
    setShowCreate(true);
  }, [canCreateLogin]);

  const headerAddAction = useMemo(
    () => ({ onClick: openTambahAkunLogin, label: 'Tambah akun login' }),
    [openTambahAkunLogin]
  );
  useScreenAddAction(isScreen ? headerAddAction : null, [isScreen, headerAddAction]);

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
        const blob = await (await fetch(photo.dataUrl)).blob();
        const file = new File([blob], 'avatar.jpg', { type: blob.type || 'image/jpeg' });
        setFotoDraft(await fileToAvatarDataUrl(file));
      }
    } catch (err) {
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

  const simpanAkunLogin = async () => {
    if (!createForm.nama.trim()) {
      toast.error('Nama akun wajib diisi');
      return;
    }
    if (createForm.pin.trim().length < 4) {
      toast.error('PIN minimal 4 karakter');
      return;
    }
    if (createForm.role === 'pengawas' && !createForm.asramaId) {
      toast.error('Pilih asrama untuk akun pengawas');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/pengguna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: createForm.nama.trim(),
          pin: createForm.pin.trim(),
          role: createForm.role,
          asramaIds:
            createForm.role === 'pengawas'
              ? [createForm.asramaId]
              : createForm.role === 'bendahara'
                ? []
                : [],
          akses: [],
          aktif: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!res.ok) {
        toast.error(data.error || 'Gagal menambah akun login');
        return;
      }
      if (data.id && fotoDraft.trim()) setAvatar(data.id, fotoDraft);
      toast.success('Akun login ditambahkan');
      setShowCreate(false);
      setCreateForm(emptyCreate);
      setFotoDraft('');
      refreshAccounts();
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageWithPullRefresh keys={['settings']} className="space-y-4">
      <section className={cn(appCardClass, 'p-4 space-y-3')}>
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-50">
          <Users className="w-3.5 h-3.5 text-emerald-600" />
          Pilih akun untuk masuk
        </p>

        {!selected ? (
          <div className="space-y-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelected(a);
                  setPin('');
                }}
                className={cn(appListCardButtonClass, 'flex items-center gap-3 space-y-0')}
              >
                <AccountAvatar id={a.id} nama={a.nama} />
                <span className="flex-1 min-w-0 text-left">
                  <span className="block text-xs font-bold text-slate-900 dark:text-slate-50 truncate leading-tight">
                    {a.nama}
                    {a.id === currentId ? (
                      <span className="ml-1.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                        Aktif
                      </span>
                    ) : null}
                  </span>
                  <span className={cn(appMutedTextClass, 'flex items-center gap-1 text-[11px] leading-snug mt-0.5')}>
                    {a.role === 'super_admin' ? <ShieldCheck className="w-3 h-3" /> : null}
                    {penggunaRoleLabel(a.role)}
                  </span>
                </span>
              </button>
            ))}
            {accounts.length === 0 && (
              <p className={cn(appMutedTextClass, 'text-center text-[11px] py-3')}>
                Belum ada akun login
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Kembali ({selected.nama})
            </button>
            <div className="flex items-center gap-3">
              <AccountAvatar id={selected.id} nama={selected.nama} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-50 truncate">
                  {selected.nama}
                </p>
                <p className={cn(appMutedTextClass, 'text-[11px]')}>
                  {penggunaRoleLabel(selected.role)}
                </p>
              </div>
            </div>
            <div>
              <label className={appLabelClass}>PIN / kata sandi</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                autoFocus
                className={appFieldClass}
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void masuk()}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={loading}
              onClick={() => void masuk()}
            >
              <KeyRound className="w-4 h-4" />
              {loading ? 'Memeriksa…' : 'Masuk'}
            </Button>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={keluar}
        className={cn(
          appListCardButtonClass,
          'flex items-center justify-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs'
        )}
      >
        <LogOut className="w-4 h-4" />
        Keluar dari akun (Logout)
      </button>

      <AppModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Tambah akun login"
        description="Akun baru bisa dipakai untuk masuk di layar ini."
      >
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className={appLabelClass}>Foto</label>
            <div className="flex items-center gap-3">
              <span className="w-14 h-14 rounded-full overflow-hidden shrink-0 bg-emerald-600 text-white flex items-center justify-center text-lg font-black">
                {fotoDraft ? (
                  <img src={fotoDraft} alt="" className="w-full h-full object-cover" />
                ) : (
                  avatarInitials(createForm.nama || 'A')
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
          </div>

          <div className="space-y-1">
            <label className={appLabelClass}>Nama akun</label>
            <input
              className={appFieldClass}
              value={createForm.nama}
              onChange={(e) => setCreateForm((f) => ({ ...f, nama: e.target.value }))}
              placeholder="cth: Ust. Ahmad"
            />
          </div>

          <div className="space-y-1">
            <label className={appLabelClass}>PIN login (min. 4)</label>
            <input
              className={appFieldClass}
              type="password"
              inputMode="numeric"
              value={createForm.pin}
              onChange={(e) => setCreateForm((f) => ({ ...f, pin: e.target.value }))}
              placeholder="PIN untuk masuk"
            />
          </div>

          <div className="space-y-1">
            <label className={appLabelClass}>Jenis akun</label>
            <select
              className={appSelectClass}
              value={createForm.role}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  role: e.target.value as PenggunaRole,
                  asramaId: '',
                }))
              }
            >
              {PENGGUNA_ROLE_OPTIONS.filter((r) => r.id !== 'super_admin').map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {createForm.role === 'pengawas' ? (
            <div className="space-y-1">
              <label className={appLabelClass}>Asrama</label>
              <select
                className={appSelectClass}
                value={createForm.asramaId}
                onChange={(e) => setCreateForm((f) => ({ ...f, asramaId: e.target.value }))}
              >
                <option value="">Pilih asrama…</option>
                {asramaList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>
              Batal
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={saving}
              onClick={() => void simpanAkunLogin()}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>
      </AppModal>
    </PageWithPullRefresh>
  );
}
