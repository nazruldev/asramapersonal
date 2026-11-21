import { useEffect, useState } from 'react';
import { Lock, KeyRound, HelpCircle, UserCircle2, ShieldCheck, ChevronLeft, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_APP_PASSWORD,
  markAuthenticated,
  sessionUserFromPengguna,
  setSessionUser,
} from '@/lib/app-auth';
import { toast } from '@/lib/toast';
import { attemptAccountLogin, listLoginAccounts, type AccountOption } from '@/lib/app-login';
import { penggunaRoleLabel, type Pengguna } from '@/lib/app-settings';

type Mode = 'login' | 'forgot';

/** Nomor pengembang (WhatsApp) untuk reset password administrator. */
const DEVELOPER_WA_DIGITS = '812291462750';
const DEVELOPER_WA_E164 = `62${DEVELOPER_WA_DIGITS}`;
const DEVELOPER_WA_DISPLAY = '0812-2914-62750';
const DEVELOPER_WA_URL = `https://wa.me/${DEVELOPER_WA_E164}?text=${encodeURIComponent(
  'Halo, saya administrator AsramaPersonal dan lupa password. Mohon bantu reset.'
)}`;

function isAdministratorRole(role: Pengguna['role'] | undefined): boolean {
  return role === 'super_admin';
}

export function AppLoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selected, setSelected] = useState<AccountOption | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void listLoginAccounts().then(setAccounts);
  }, []);

  const submitLogin = async () => {
    if (!selected) {
      toast.error('Pilih akun terlebih dahulu');
      return;
    }
    if (!password.trim()) {
      toast.error('Masukkan PIN / kata sandi');
      return;
    }
    setLoading(true);
    try {
      const result = await attemptAccountLogin(selected.id, password);
      if (!result.ok || !result.user) {
        toast.error(result.ok ? 'Gagal masuk' : result.error);
        return;
      }
      setSessionUser(sessionUserFromPengguna(result.user as Pengguna));
      markAuthenticated();
      // Tunggu pull Turso dulu supaya Electron/web kosong tidak masuk UI kosong.
      try {
        await import('@/lib/sync/turso-sync').then((m) => m.runTursoSync());
      } catch {
        /* offline — pakai lokal */
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const forgotForAdmin = isAdministratorRole(selected?.role);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-sm border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-500 shadow-lg p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Lock className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Pengelola Asrama</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-300">
              {mode === 'login' ? 'OTA v0.2.2 · Pilih akun lalu masukkan PIN' : 'Lupa kata sandi'}
            </p>
          </div>
        </div>

        {mode === 'login' ? (
          <>
            {!selected ? (
              <div className="space-y-2">
                <Label className="text-xs">Pilih akun</Label>
                <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelected(a);
                        setPassword('');
                      }}
                      className="w-full flex items-center gap-2.5 rounded-sm border border-slate-200 dark:border-slate-600 px-3 py-2.5 text-left hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40 transition-colors active:scale-[0.99]"
                    >
                      {a.role === 'super_admin' ? (
                        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                      ) : (
                        <UserCircle2 className="w-5 h-5 text-slate-400 shrink-0" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {a.nama}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {penggunaRoleLabel(a.role)}
                        </span>
                      </span>
                    </button>
                  ))}
                  {accounts.length === 0 && (
                    <p className="text-[11px] text-slate-400 text-center py-3">Memuat akun…</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Ganti akun ({selected.nama})
                </button>
                <Label htmlFor="app-password" className="text-xs">PIN / kata sandi</Label>
                <Input
                  id="app-password"
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  placeholder="PIN"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submitLogin()}
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-300">
                  Bawaan super admin pertama kali: {DEFAULT_APP_PASSWORD}
                </p>
              </div>
            )}
            {selected && (
              <Button type="button" className="w-full" disabled={loading} onClick={() => void submitLogin()}>
                <KeyRound className="w-4 h-4" />
                {loading ? 'Memeriksa...' : 'Masuk'}
              </Button>
            )}
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="w-full text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center justify-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Lupa kata sandi?
            </button>
          </>
        ) : (
          <>
            {forgotForAdmin || !selected ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selected
                    ? 'Administrator yang lupa kata sandi, hubungi pengembang untuk dibantu reset.'
                    : 'Pilih akun di layar masuk, atau hubungi kontak di bawah sesuai peran Anda.'}
                </p>
                {!selected ? (
                  <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4">
                    <li>
                      <strong>Administrator</strong> — hubungi pengembang ({DEVELOPER_WA_DISPLAY})
                    </li>
                    <li>
                      <strong>Pengawas / peran lain</strong> — hubungi administrator untuk reset PIN
                    </li>
                  </ul>
                ) : null}
                <a
                  href={DEVELOPER_WA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp pengembang {DEVELOPER_WA_DISPLAY}
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Akun <strong>{selected.nama}</strong> ({penggunaRoleLabel(selected.role)}) yang lupa
                  kata sandi, hubungi <strong>administrator</strong> agar PIN direset dari menu
                  Pengguna / Pengaturan.
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                  Reset tidak bisa dilakukan sendiri dari layar ini demi keamanan.
                </p>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setMode('login')}
            >
              Kembali ke masuk
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Form ubah kata sandi (dipakai di Pengaturan). */
export function AppSecuritySettingsForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error('Lengkapi kata sandi lama dan baru');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Konfirmasi kata sandi tidak sama');
      return;
    }
    if (newPassword.length < 4) {
      toast.error('Kata sandi minimal 4 karakter');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Gagal mengubah kata sandi');
        return;
      }
      toast.success('Kata sandi berhasil diubah');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Gagal mengubah kata sandi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Ubah kata sandi</h3>
        <Input
          type="password"
          placeholder="Kata sandi saat ini"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Kata sandi baru"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Ulangi kata sandi baru"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button type="button" className="w-full" disabled={loading} onClick={() => void changePassword()}>
          Simpan kata sandi baru
        </Button>
      </div>
      <p className="text-[10px] text-slate-500 leading-snug">
        Lupa kata sandi administrator? Hubungi pengembang di WhatsApp {DEVELOPER_WA_DISPLAY}.
        Pengawas yang lupa PIN: minta administrator mereset.
      </p>
    </div>
  );
}
