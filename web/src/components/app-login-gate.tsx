import { useState } from 'react';
import { Lock, KeyRound, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_APP_PASSWORD,
  SECURITY_QUESTION_OPTIONS,
  markAuthenticated,
  securityQuestionLabel,
  type SecurityQuestionId,
} from '@/lib/app-auth';
import { appSelectClass } from '@/lib/form-styles';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { attemptAppLogin } from '@/lib/app-login';

type Mode = 'login' | 'forgot';

export function AppLoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotAnswers, setForgotAnswers] = useState<Record<SecurityQuestionId, string>>({} as Record<SecurityQuestionId, string>);
  const [recoveryQuestions, setRecoveryQuestions] = useState<
    { questionId: SecurityQuestionId; label: string }[] | null
  >(null);

  const submitLogin = async () => {
    if (!password.trim()) {
      toast.error('Masukkan kata sandi');
      return;
    }
    setLoading(true);
    try {
      const result = await attemptAppLogin(password);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      markAuthenticated();
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const openForgot = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/recovery-questions');
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as {
        configured: boolean;
        questions: { questionId: SecurityQuestionId }[];
      };
      if (!data.configured || data.questions.length !== 3) {
        toast.error('Pertanyaan keamanan belum diatur di Pengaturan');
        return;
      }
      setRecoveryQuestions(
        data.questions.map((q) => ({
          questionId: q.questionId,
          label: securityQuestionLabel(q.questionId),
        }))
      );
      setForgotAnswers({} as Record<SecurityQuestionId, string>);
      setMode('forgot');
    } catch {
      toast.error('Gagal memuat pertanyaan pemulihan');
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async () => {
    if (!recoveryQuestions) return;
    const answers = recoveryQuestions.map((q) => ({
      questionId: q.questionId,
      answer: forgotAnswers[q.questionId] ?? '',
    }));
    if (answers.some((a) => !a.answer.trim())) {
      toast.error('Jawab semua pertanyaan');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Jawaban tidak cocok');
        return;
      }
      toast.success(`Kata sandi direset ke default (${DEFAULT_APP_PASSWORD})`);
      setMode('login');
      setPassword('');
      setRecoveryQuestions(null);
    } catch {
      toast.error('Gagal mereset kata sandi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-sm border border-slate-300 bg-white dark:bg-slate-900 dark:border-slate-500 shadow-lg p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-sm bg-emerald-600 text-white flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Pengelola Asrama</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-300">
              {mode === 'login' ? 'Masuk dengan kata sandi aplikasi' : 'Pulihkan kata sandi'}
            </p>
          </div>
        </div>

        {mode === 'login' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="app-password" className="text-xs">Kata sandi</Label>
              <Input
                id="app-password"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                placeholder="Kata sandi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitLogin()}
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-300">Bawaan pertama kali: {DEFAULT_APP_PASSWORD}</p>
            </div>
            <Button type="button" className="w-full" disabled={loading} onClick={() => void submitLogin()}>
              <KeyRound className="w-4 h-4" />
              {loading ? 'Memeriksa...' : 'Masuk'}
            </Button>
            <button
              type="button"
              onClick={() => void openForgot()}
              className="w-full text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center justify-center gap-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Lupa kata sandi?
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              Jawab ketiga pertanyaan keamanan yang Anda atur di Pengaturan. Jika benar, kata sandi kembali ke{' '}
              <strong>{DEFAULT_APP_PASSWORD}</strong>.
            </p>
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {recoveryQuestions?.map((q) => (
                <div key={q.questionId} className="space-y-1">
                  <Label className="text-[10px] text-slate-500 leading-snug">{q.label}</Label>
                  <Input
                    className="h-9 text-xs"
                    value={forgotAnswers[q.questionId] ?? ''}
                    onChange={(e) =>
                      setForgotAnswers((prev) => ({ ...prev, [q.questionId]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={loading}
                onClick={() => {
                  setMode('login');
                  setRecoveryQuestions(null);
                }}
              >
                Batal
              </Button>
              <Button type="button" className="flex-1" disabled={loading} onClick={() => void submitForgot()}>
                Reset kata sandi
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Form pengaturan kata sandi & pertanyaan keamanan (dipakai di Pengaturan). */
export function AppSecuritySettingsForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [q1, setQ1] = useState<SecurityQuestionId | ''>('');
  const [q2, setQ2] = useState<SecurityQuestionId | ''>('');
  const [q3, setQ3] = useState<SecurityQuestionId | ''>('');
  const [a1, setA1] = useState('');
  const [a2, setA2] = useState('');
  const [a3, setA3] = useState('');

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

  const saveSecurityQuestions = async () => {
    if (!q1 || !q2 || !q3 || !a1.trim() || !a2.trim() || !a3.trim()) {
      toast.error('Pilih 3 pertanyaan berbeda dan isi jawabannya');
      return;
    }
    const ids = [q1, q2, q3];
    if (new Set(ids).size !== 3) {
      toast.error('Pilih tiga pertanyaan yang berbeda');
      return;
    }
    if (!currentPassword.trim()) {
      toast.error('Masukkan kata sandi saat ini untuk menyimpan pertanyaan');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/security-questions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          questions: [
            { questionId: q1, answer: a1 },
            { questionId: q2, answer: a2 },
            { questionId: q3, answer: a3 },
          ],
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error || 'Gagal menyimpan pertanyaan');
        return;
      }
      toast.success('Pertanyaan keamanan tersimpan');
      setA1('');
      setA2('');
      setA3('');
      setCurrentPassword('');
    } catch {
      toast.error('Gagal menyimpan pertanyaan');
    } finally {
      setLoading(false);
    }
  };

  const questionSelect = (
    value: SecurityQuestionId | '',
    onChange: (v: SecurityQuestionId) => void,
    exclude: SecurityQuestionId[]
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SecurityQuestionId)}
      className={cn(appSelectClass, 'text-xs')}
    >
      <option value="">Pilih pertanyaan...</option>
      {SECURITY_QUESTION_OPTIONS.filter((o) => !exclude.includes(o.id) || o.id === value).map((o) => (
        <option key={o.id} value={o.id} disabled={exclude.includes(o.id) && o.id !== value}>
          {o.label}
        </option>
      ))}
    </select>
  );

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

      <div className="border-t border-slate-200 pt-3 space-y-2">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Pertanyaan keamanan (3)</h3>
        <p className="text-[10px] text-slate-500 leading-snug">
          Dipakai saat lupa kata sandi untuk mengembalikan ke bawaan ({DEFAULT_APP_PASSWORD}). Pilih tiga pertanyaan
          berbeda.
        </p>
        {questionSelect(q1, setQ1, [q2, q3].filter(Boolean) as SecurityQuestionId[])}
        <Input className="h-9 text-xs" placeholder="Jawaban 1" value={a1} onChange={(e) => setA1(e.target.value)} />
        {questionSelect(q2, setQ2, [q1, q3].filter(Boolean) as SecurityQuestionId[])}
        <Input className="h-9 text-xs" placeholder="Jawaban 2" value={a2} onChange={(e) => setA2(e.target.value)} />
        {questionSelect(q3, setQ3, [q1, q2].filter(Boolean) as SecurityQuestionId[])}
        <Input className="h-9 text-xs" placeholder="Jawaban 3" value={a3} onChange={(e) => setA3(e.target.value)} />
        <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => void saveSecurityQuestions()}>
          Simpan pertanyaan keamanan
        </Button>
      </div>
    </div>
  );
}
