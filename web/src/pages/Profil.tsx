import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Trophy,
  MapPin,
  FileText,
  CalendarRange,
  Settings,
  HardDrive,
  ChevronRight,
  Building2,
  LogOut,
  Camera,
  KeyRound,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import {
  getSessionUser,
  hasModuleAccess,
  setActiveAsramaId,
  subscribeSessionUser,
} from '@/lib/app-auth';
import {
  avatarInitials,
  fileToAvatarDataUrl,
  getAvatar,
  setAvatar,
  subscribeAvatar,
} from '@/lib/app-avatar';
import {
  penggunaRoleLabel,
  type Asrama,
  type ModulAkses,
} from '@/lib/app-settings';
import { appFieldClass, appLabelClass, appSelectClass } from '@/lib/form-styles';
import { appCardClass, appListCardButtonClass, appMutedTextClass } from '@/lib/surface-styles';
import { toast } from '@/lib/toast';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

type MenuLink = {
  label: string;
  desc: string;
  path: string;
  icon: LucideIcon;
  modul?: ModulAkses;
};

const MENU_LAINNYA: MenuLink[] = [
  { label: 'Peringkat Santri', desc: 'Poin pelanggaran & prestasi terbanyak.', path: '/laporan/peringkat', icon: Trophy, modul: 'laporan' },
  { label: 'Sebaran Wilayah', desc: 'Peta asal wilayah santri.', path: '/laporan/wilayah', icon: MapPin, modul: 'laporan' },
  { label: 'Menu Laporan', desc: 'Unduh & bagikan rekap per periode.', path: '/laporan', icon: FileText, modul: 'laporan' },
  { label: 'Penjadwalan', desc: 'Jadwal kegiatan & piket asrama.', path: '/penjadwalan', icon: CalendarRange, modul: 'penjadwalan' },
  { label: 'Pengaturan Asrama', desc: 'Nama asrama, pertanyaan keamanan, dll.', path: '/pengaturan', icon: Settings, modul: 'pengaturan' },
  { label: 'Cadangan Data', desc: 'Ekspor / impor database & sinkronisasi.', path: '/database', icon: HardDrive, modul: 'database' },
];

export default function Profil() {
  const navigate = useNavigate();
  const reloadAll = useAppStore((s) => s.reloadAll);
  const [user, setUser] = useState(() => getSessionUser());
  const [avatar, setAvatarState] = useState<string | null>(() => getAvatar(getSessionUser()?.id));
  const [avatarOpen, setAvatarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [asramaList, setAsramaList] = useState<Asrama[]>([]);
  const [pinLama, setPinLama] = useState('');
  const [pinBaru, setPinBaru] = useState('');
  const [pinUlang, setPinUlang] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(
    () =>
      subscribeSessionUser(() => {
        const u = getSessionUser();
        setUser(u);
        setAvatarState(getAvatar(u?.id));
      }),
    []
  );

  useEffect(() => subscribeAvatar(() => setAvatarState(getAvatar(getSessionUser()?.id))), []);

  useEffect(() => {
    void fetch('/api/asrama')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAsramaList(data as Asrama[]))
      .catch(() => setAsramaList([]));
  }, []);

  const dibatasiTugas =
    user && user.role !== 'super_admin' && user.asramaIds.length > 0;
  const asramaOptions = dibatasiTugas
    ? asramaList.filter((a) => user.asramaIds.includes(a.id))
    : asramaList;
  const bisaPilihSemua = !user || user.role !== 'pengawas';
  const activeAsrama =
    user?.activeAsramaId ?? (asramaOptions.length === 1 ? (asramaOptions[0]?.id ?? null) : null);

  const links = MENU_LAINNYA.filter((l) => !l.modul || hasModuleAccess(user, l.modul));

  const pilihFoto = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setAvatar(user?.id, dataUrl);
      setAvatarOpen(false);
      toast.success('Foto profil diperbarui');
    } catch {
      toast.error('Gagal memproses foto');
    }
  };

  const gantiPin = async () => {
    if (pinBaru.trim().length < 4) {
      toast.error('PIN baru minimal 4 karakter');
      return;
    }
    if (pinBaru !== pinUlang) {
      toast.error('Konfirmasi PIN tidak sama');
      return;
    }
    setSavingPin(true);
    try {
      const res = await fetch(
        user ? '/api/auth/change-pin' : '/api/auth/change-password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            user
              ? { id: user.id, currentPin: pinLama, newPin: pinBaru }
              : { currentPassword: pinLama, newPassword: pinBaru }
          ),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || 'Gagal mengganti PIN');
        return;
      }
      toast.success('PIN berhasil diganti');
      setPinLama('');
      setPinBaru('');
      setPinUlang('');
    } finally {
      setSavingPin(false);
    }
  };

  const nama = user?.nama ?? 'Administrator';

  return (
    <PageWithPullRefresh keys={['settings']} className="space-y-4">
      {/* Kartu profil */}
      <section className={cn(appCardClass, 'p-4 flex items-center gap-3')}>
        <button
          type="button"
          onClick={() => setAvatarOpen(true)}
          className="relative w-16 h-16 rounded-full overflow-hidden shrink-0 bg-emerald-600 text-white flex items-center justify-center text-xl font-black ring-2 ring-emerald-500/30 active:scale-95 transition-transform"
          aria-label="Ganti foto profil"
        >
          {avatar ? (
            <img src={avatar} alt={nama} className="w-full h-full object-cover" />
          ) : (
            avatarInitials(nama)
          )}
          <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white flex items-center justify-center py-0.5">
            <Camera className="w-3 h-3" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-slate-900 dark:text-slate-50 truncate leading-tight">
            {nama}
          </p>
          <p className={cn(appMutedTextClass, 'text-xs leading-tight mt-0.5')}>
            {user ? penggunaRoleLabel(user.role) : 'Super Admin'}
          </p>
        </div>
      </section>

      {/* Asrama aktif */}
      {asramaOptions.length > 1 || (bisaPilihSemua && asramaOptions.length >= 1) ? (
        <section className={cn(appCardClass, 'p-4 space-y-2')}>
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-50">
            <Building2 className="w-3.5 h-3.5 text-emerald-600" />
            Asrama aktif
          </p>
          <select
            className={cn(appSelectClass, 'h-10')}
            value={activeAsrama ?? ''}
            onChange={(e) => {
              setActiveAsramaId(e.target.value || null);
              void reloadAll();
            }}
          >
            {bisaPilihSemua && <option value="">Semua asrama</option>}
            {asramaOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      {/* Ganti PIN */}
      <section className={cn(appCardClass, 'p-4 space-y-3')}>
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-50">
          <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
          Ganti PIN
        </p>
        <div>
          <label className={appLabelClass}>PIN saat ini</label>
          <input
            type="password"
            inputMode="numeric"
            className={appFieldClass}
            value={pinLama}
            onChange={(e) => setPinLama(e.target.value)}
            placeholder="PIN lama"
          />
        </div>
        <div>
          <label className={appLabelClass}>PIN baru</label>
          <input
            type="password"
            inputMode="numeric"
            className={appFieldClass}
            value={pinBaru}
            onChange={(e) => setPinBaru(e.target.value)}
            placeholder="Minimal 4 karakter"
          />
        </div>
        <div>
          <label className={appLabelClass}>Ulangi PIN baru</label>
          <input
            type="password"
            inputMode="numeric"
            className={appFieldClass}
            value={pinUlang}
            onChange={(e) => setPinUlang(e.target.value)}
            placeholder="Ketik ulang PIN baru"
          />
        </div>
        <Button
          type="button"
          onClick={() => void gantiPin()}
          disabled={savingPin || !pinLama || !pinBaru}
          className="w-full"
        >
          {savingPin ? 'Menyimpan…' : 'Simpan PIN Baru'}
        </Button>
      </section>

      {/* Menu lainnya */}
      {links.length > 0 ? (
        <section className="space-y-2">
          <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Menu lainnya
          </p>
          <div className="space-y-2">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.path}
                  type="button"
                  onClick={() => navigate(link.path)}
                  className={cn(appListCardButtonClass, 'flex items-center gap-3 space-y-0')}
                >
                  <span className="w-9 h-9 rounded-sm bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Icon className="w-4.5 h-4.5" strokeWidth={2.25} />
                  </span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-xs font-bold text-slate-900 dark:text-slate-50 leading-tight">
                      {link.label}
                    </span>
                    <span className={cn(appMutedTextClass, 'block text-[11px] leading-snug mt-0.5')}>
                      {link.desc}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Ganti akun */}
      <button
        type="button"
        onClick={() => navigate('/ganti-akun')}
        className={cn(
          appListCardButtonClass,
          'flex items-center justify-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs'
        )}
      >
        <LogOut className="w-4 h-4" />
        Ganti Akun / Keluar
      </button>

      {/* Modal avatar */}
      <AppModal
        open={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        title="Foto Profil"
        description="Foto tersimpan di perangkat ini."
      >
        <div className="p-4 space-y-3">
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-emerald-600 text-white flex items-center justify-center text-3xl font-black">
              {avatar ? (
                <img src={avatar} alt={nama} className="w-full h-full object-cover" />
              ) : (
                avatarInitials(nama)
              )}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pilihFoto(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="w-4 h-4 mr-1.5" />
            Pilih Foto
          </Button>
          {avatar ? (
            <Button
              type="button"
              variant="outline"
              className="w-full text-rose-600 dark:text-rose-400"
              onClick={() => {
                setAvatar(user?.id, null);
                setAvatarOpen(false);
                toast.success('Foto profil dihapus');
              }}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Hapus Foto
            </Button>
          ) : null}
        </div>
      </AppModal>
    </PageWithPullRefresh>
  );
}
