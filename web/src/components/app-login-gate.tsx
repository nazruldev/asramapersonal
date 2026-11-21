import { useEffect, useRef, useState } from 'react';
import {
  Lock,
  KeyRound,
  HelpCircle,
  UserCircle2,
  ShieldCheck,
  Eye,
  MessageCircle,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomPicker } from '@/components/ui/bottom-picker';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  clampPinInput,
  markAuthenticated,
  pinLengthError,
  sessionUserFromPengguna,
  setSessionUser,
} from '@/lib/app-auth';
import { toast } from '@/lib/toast';
import { attemptAccountLogin, listLoginAccounts, type AccountOption } from '@/lib/app-login';
import { penggunaRoleLabel, type Pengguna } from '@/lib/app-settings';
import { appLabelClass, appSelectClass } from '@/lib/form-styles';
import { cn } from '@/lib/utils';

function AccountRoleIcon({ role }: { role: Pengguna['role'] }) {
  if (role === 'super_admin') {
    return <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />;
  }
  if (role === 'pengawas') {
    return <Eye className="w-5 h-5 text-sky-600 shrink-0" />;
  }
  return <UserCircle2 className="w-5 h-5 text-slate-400 shrink-0" />;
}

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

/** Input PIN bergaya OTP — satu kotak per digit. */
function PinOtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: PIN_MAX_LENGTH }, (_, i) => value[i] ?? '');

  const focusAt = (index: number) => {
    const el = refs.current[Math.max(0, Math.min(PIN_MAX_LENGTH - 1, index))];
    el?.focus();
    el?.select();
  };

  const setPin = (next: string) => {
    const clamped = clampPinInput(next);
    onChange(clamped);
    if (clamped.length >= PIN_MIN_LENGTH && clamped.length === PIN_MAX_LENGTH) {
      onComplete?.(clamped);
    }
  };

  return (
    <div className="flex items-center justify-between gap-1.5" role="group" aria-label="PIN">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          value={digit}
          aria-label={`Digit PIN ${index + 1}`}
          className={cn(
            'w-10 h-12 sm:w-11 sm:h-12 text-center text-lg font-bold tracking-widest',
            'rounded-sm border border-slate-300 bg-slate-50 text-slate-900',
            'focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none',
            'dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50',
            'dark:focus:border-emerald-400 disabled:opacity-50'
          )}
          onChange={(e) => {
            const raw = clampPinInput(e.target.value);
            if (!raw) {
              setPin(value.slice(0, index) + value.slice(index + 1));
              return;
            }
            const char = raw.slice(-1);
            const rebuilt = clampPinInput(value.slice(0, index) + char + value.slice(index + 1));
            setPin(rebuilt);
            if (index < PIN_MAX_LENGTH - 1) focusAt(index + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (digits[index]) {
                setPin(value.slice(0, index) + value.slice(index + 1));
              } else if (index > 0) {
                setPin(value.slice(0, index - 1) + value.slice(index));
                focusAt(index - 1);
              }
              return;
            }
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              focusAt(index - 1);
              return;
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              focusAt(index + 1);
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (value.length >= PIN_MIN_LENGTH) onComplete?.(value);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = clampPinInput(e.clipboardData.getData('text'));
            if (!pasted) return;
            setPin(pasted);
            focusAt(Math.min(pasted.length, PIN_MAX_LENGTH - 1));
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export function AppLoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selected, setSelected] = useState<AccountOption | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  useEffect(() => {
    void listLoginAccounts().then(setAccounts);
  }, []);

  const submitLogin = async (pinOverride?: string) => {
    const pin = (pinOverride ?? password).trim();
    if (!selected) {
      toast.error('Pilih akun terlebih dahulu');
      return;
    }
    if (!pin) {
      toast.error('Masukkan PIN');
      return;
    }
    const lenErr = pinLengthError(pin);
    if (lenErr) {
      toast.error(lenErr);
      return;
    }
    setLoading(true);
    try {
      const result = await attemptAccountLogin(selected.id, pin);
      if (!result.ok || !result.user) {
        toast.error(result.ok ? 'Gagal masuk' : result.error);
        setPassword('');
        return;
      }
      setSessionUser(sessionUserFromPengguna(result.user as Pengguna));
      markAuthenticated();
      // Full-online: pull Turso (+ pembayaran) wajib sebelum masuk UI.
      try {
        await import('@/lib/sync/turso-sync').then((m) => m.runTursoSync());
        await import('@/lib/pembayaran-store').then((m) => m.pullPembayaranFromTurso());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Gagal sync Turso');
        return;
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const forgotForAdmin = isAdministratorRole(selected?.role);

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: a.nama,
    sublabel: penggunaRoleLabel(a.role),
  }));

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
            <div className="space-y-1.5">
              <Label className={appLabelClass}>Pilih akun</Label>
              <button
                type="button"
                onClick={() => setAccountPickerOpen(true)}
                disabled={loading || accounts.length === 0}
                className={cn(
                  appSelectClass,
                  'w-full text-left flex items-center justify-between gap-2 h-12 px-3'
                )}
              >
                {selected ? (
                  <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    <AccountRoleIcon role={selected.role} />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {selected.nama}
                      </span>
                      <span
                        className={
                          selected.role === 'pengawas'
                            ? 'block text-[10px] font-semibold text-sky-600 dark:text-sky-400'
                            : 'block text-[10px] text-slate-400'
                        }
                      >
                        {penggunaRoleLabel(selected.role)}
                      </span>
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">
                    {accounts.length === 0 ? 'Memuat akun…' : 'Pilih akun mana…'}
                  </span>
                )}
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className={appLabelClass}>PIN</Label>
              <PinOtpInput
                value={password}
                onChange={setPassword}
                disabled={loading || !selected}
                autoFocus={Boolean(selected)}
                onComplete={(pin) => void submitLogin(pin)}
              />
              <p className="text-[10px] text-slate-400">
                {PIN_MIN_LENGTH}–{PIN_MAX_LENGTH} digit
              </p>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={loading || !selected || password.length < PIN_MIN_LENGTH}
              onClick={() => void submitLogin()}
            >
              <KeyRound className="w-4 h-4" />
              {loading ? 'Memeriksa...' : 'Masuk'}
            </Button>
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="w-full text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center justify-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Lupa kata sandi?
            </button>

            <BottomPicker
              open={accountPickerOpen}
              onClose={() => setAccountPickerOpen(false)}
              title="Pilih akun"
              description="Pilih akun yang ingin dipakai masuk"
              searchPlaceholder="Cari nama akun…"
              options={accountOptions}
              value={selected?.id ?? ''}
              onSelect={(id) => {
                const next = accounts.find((a) => a.id === id) ?? null;
                setSelected(next);
                setPassword('');
                setAccountPickerOpen(false);
              }}
            />
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
    const lengthErr = pinLengthError(newPassword);
    if (lengthErr) {
      toast.error(lengthErr.replace(/^PIN/, 'Kata sandi'));
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
          inputMode="numeric"
          maxLength={PIN_MAX_LENGTH}
          placeholder="Kata sandi saat ini"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(clampPinInput(e.target.value))}
        />
        <Input
          type="password"
          inputMode="numeric"
          maxLength={PIN_MAX_LENGTH}
          placeholder={`Kata sandi baru (${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digit)`}
          value={newPassword}
          onChange={(e) => setNewPassword(clampPinInput(e.target.value))}
        />
        <Input
          type="password"
          inputMode="numeric"
          maxLength={PIN_MAX_LENGTH}
          placeholder="Ulangi kata sandi baru"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(clampPinInput(e.target.value))}
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
