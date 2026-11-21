import { useEffect, useState } from 'react';
import { Eye, LogOut, Plus, ShieldCheck, UserCircle2, Users } from 'lucide-react';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { Button } from '@/components/ui/button';
import { clearAuthenticated, getSessionUser } from '@/lib/app-auth';
import { avatarInitials, getAvatar, subscribeAvatar } from '@/lib/app-avatar';
import { listLoginAccounts, type AccountOption } from '@/lib/app-login';
import { penggunaRoleLabel, type PenggunaRole } from '@/lib/app-settings';
import { appCardClass, appListCardButtonClass, appMutedTextClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';

function RoleIcon({ role }: { role: PenggunaRole }) {
  if (role === 'super_admin') return <ShieldCheck className="w-3 h-3" />;
  if (role === 'pengawas') return <Eye className="w-3 h-3 text-sky-600" />;
  return <UserCircle2 className="w-3 h-3" />;
}

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

export default function GantiAkun() {
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const currentId = getSessionUser()?.id;

  useEffect(() => {
    void listLoginAccounts().then(setAccounts);
  }, []);

  /** Tambah akun = login lagi seperti layar masuk biasa (pilih akun + PIN). */
  const tambahAkunLogin = () => {
    clearAuthenticated();
    window.location.reload();
  };

  const keluar = () => {
    clearAuthenticated();
    window.location.reload();
  };

  return (
    <div className="relative min-h-full">
      <PageWithPullRefresh keys={['settings']} className="space-y-4 pb-28">
        <section className={cn(appCardClass, 'p-4 space-y-3')}>
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-50">
            <Users className="w-3.5 h-3.5 text-emerald-600" />
            Akun di perangkat ini
          </p>

          <div className="space-y-2">
            {accounts.map((a) => (
              <div
                key={a.id}
                className={cn(
                  appListCardButtonClass,
                  'flex items-center gap-3 space-y-0 pointer-events-none',
                  a.id === currentId &&
                    'border-emerald-500 ring-1 ring-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/40'
                )}
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
                  <span
                    className={cn(
                      appMutedTextClass,
                      'flex items-center gap-1 text-[11px] leading-snug mt-0.5'
                    )}
                  >
                    <RoleIcon role={a.role} />
                    {penggunaRoleLabel(a.role)}
                  </span>
                </span>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className={cn(appMutedTextClass, 'text-center text-[11px] py-3')}>
                Belum ada akun login
              </p>
            )}
          </div>
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

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 dark:border-slate-500 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_25px_rgba(0,0,0,0.08)]">
        <div className="max-w-lg mx-auto">
          <Button type="button" className="w-full" onClick={tambahAkunLogin}>
            <Plus className="w-4 h-4" />
            Tambah Akun
          </Button>
        </div>
      </div>
    </div>
  );
}
