import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ShieldCheck,
  ChevronLeft,
  KeyRound,
  LogOut,
  Users,
} from 'lucide-react';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { Button } from '@/components/ui/button';
import {
  clearAuthenticated,
  getSessionUser,
  markAuthenticated,
  sessionUserFromPengguna,
  setSessionUser,
} from '@/lib/app-auth';
import { avatarInitials, getAvatar, subscribeAvatar } from '@/lib/app-avatar';
import { attemptAccountLogin, listLoginAccounts, type AccountOption } from '@/lib/app-login';
import { penggunaRoleLabel, type Pengguna } from '@/lib/app-settings';
import { appFieldClass, appLabelClass } from '@/lib/form-styles';
import { appCardClass, appListCardButtonClass, appMutedTextClass } from '@/lib/surface-styles';
import { toast } from '@/lib/toast';
import { useAppStore } from '@/store/app-store';
import { cn } from '@/lib/utils';

function AccountAvatar({ id, nama }: { id: string; nama: string }) {
  const [avatar, setAvatar] = useState<string | null>(() => getAvatar(id));
  useEffect(() => subscribeAvatar(() => setAvatar(getAvatar(id))), [id]);
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

export default function GantiAkun() {
  const navigate = useNavigate();
  const reloadAll = useAppStore((s) => s.reloadAll);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selected, setSelected] = useState<AccountOption | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const currentId = getSessionUser()?.id;

  useEffect(() => {
    void listLoginAccounts().then(setAccounts);
  }, []);

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
                Memuat akun…
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
    </PageWithPullRefresh>
  );
}
