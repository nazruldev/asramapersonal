import { useMemo, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomPicker } from '@/components/ui/bottom-picker';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  clampPinInput,
  pinLengthError,
} from '@/lib/app-auth';
import { DEFAULT_APP_SETTINGS } from '@/lib/app-settings';
import { DEFAULT_KELAS_SEED } from '@/lib/kelas-defaults';
import {
  getIndonesiaTimezoneMeta,
  INDONESIA_TIMEZONES,
  normalizeIndonesiaTimezone,
  type IndonesiaTimezoneId,
} from '@/lib/indonesia-timezone';
import { appSelectClass } from '@/lib/form-styles';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { OnboardingCompleteBody } from '@/lib/onboarding-api';

const STEPS = [
  { id: 1, title: 'Profil lembaga', icon: Building2 },
  { id: 2, title: 'Keamanan', icon: KeyRound },
  { id: 3, title: 'Kelas', icon: GraduationCap },
] as const;

type Props = {
  onComplete: () => void;
};

export function AppSetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [zonaPickerOpen, setZonaPickerOpen] = useState(false);

  const [namaAsrama, setNamaAsrama] = useState('');
  const [zonaWaktu, setZonaWaktu] = useState<IndonesiaTimezoneId>(DEFAULT_APP_SETTINGS.zonaWaktu);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [useDefaultKelas, setUseDefaultKelas] = useState(true);

  const zonaMeta = useMemo(
    () => getIndonesiaTimezoneMeta(normalizeIndonesiaTimezone(zonaWaktu)),
    [zonaWaktu]
  );

  const zonaPickerOptions = useMemo(
    () =>
      INDONESIA_TIMEZONES.map((z) => ({
        value: z.id,
        label: `${z.shortLabel} — ${z.name}`,
        sublabel: `${z.utcOffset} · ${z.hint}`,
        badge: z.shortLabel,
        badgeTone: 'slate' as const,
      })),
    []
  );

  const kelasPreview = useMemo(() => {
    const byTingkat = new Map<string, string[]>();
    for (const k of DEFAULT_KELAS_SEED) {
      const list = byTingkat.get(k.tingkat) ?? [];
      list.push(k.nama);
      byTingkat.set(k.tingkat, list);
    }
    return [...byTingkat.entries()].map(([tingkat, nums]) => `${tingkat} ${nums.join(', ')}`);
  }, []);

  const goNext = () => {
    if (step === 1) {
      if (!namaAsrama.trim()) {
        toast.error('Masukkan nama sekolah / pondok');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const pwdErr = pinLengthError(newPassword);
      if (pwdErr) {
        toast.error(pwdErr.replace(/^PIN/, 'Kata sandi'));
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('Konfirmasi kata sandi tidak sama');
        return;
      }
      setStep(3);
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      const payload: OnboardingCompleteBody = {
        namaAsrama: namaAsrama.trim(),
        jenisAsrama: '',
        zonaWaktu,
        newPassword,
        useDefaultKelas,
      };
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? 'Gagal menyimpan pengaturan awal');
        return;
      }
      toast.success('Pengaturan awal tersimpan');
      onComplete();
    } catch {
      toast.error('Gagal menyimpan pengaturan awal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4 overflow-y-auto">
      <div className="w-full max-w-sm rounded-sm border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-700 shadow-lg p-5 space-y-4 my-auto">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900 dark:text-white">Atur aplikasi</h1>
            <p className="text-[11px] text-slate-500">
              Langkah {step} dari 3 · {STEPS[step - 1].title}
            </p>
          </div>
        </div>

        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                s.id <= step ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'
              )}
            />
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="setup-nama" className="text-xs">Nama sekolah / pondok</Label>
              <Input
                id="setup-nama"
                placeholder="Contoh: Pondok Pesantren Al-Khairaat"
                value={namaAsrama}
                onChange={(e) => setNamaAsrama(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Zona waktu</Label>
              <button
                type="button"
                onClick={() => setZonaPickerOpen(true)}
                className={cn(
                  appSelectClass,
                  'w-full text-left flex items-center justify-between gap-2 h-10 px-3'
                )}
              >
                <span className="truncate text-xs font-medium">
                  {zonaMeta.shortLabel} — {zonaMeta.name}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              Buat kata sandi untuk membuka aplikasi. Simpan dengan aman — Anda bisa mengubahnya lagi di Pengaturan.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="setup-pass" className="text-xs">
                Kata sandi baru ({PIN_MIN_LENGTH}–{PIN_MAX_LENGTH} digit)
              </Label>
              <Input
                id="setup-pass"
                type="password"
                inputMode="numeric"
                maxLength={PIN_MAX_LENGTH}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(clampPinInput(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-pass2" className="text-xs">Konfirmasi kata sandi</Label>
              <Input
                id="setup-pass2"
                type="password"
                inputMode="numeric"
                maxLength={PIN_MAX_LENGTH}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(clampPinInput(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && goNext()}
              />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              Kelas dipakai saat mendaftarkan santri. Anda bisa menambah atau mengubahnya nanti di Kelola Data → Kelas.
            </p>
            <label
              className={cn(
                'flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors',
                useDefaultKelas
                  ? 'border-emerald-600/40 bg-emerald-50/80 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-700'
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={useDefaultKelas}
                onChange={(e) => setUseDefaultKelas(e.target.checked)}
              />
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Gunakan kelas default
                </span>
                <p className="text-[10px] text-slate-500 leading-snug">
                  {kelasPreview.join(' · ')}
                </p>
                <p className="text-[10px] text-slate-400">
                  Jika daftar kelas sudah ada, opsi ini tidak mengubah data yang ada.
                </p>
              </div>
            </label>
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={loading}
              onClick={() => setStep((s) => s - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
              Kembali
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" className="flex-1" onClick={goNext}>
              Lanjut
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="button" className="flex-1" disabled={loading} onClick={() => void submit()}>
              {loading ? 'Menyimpan...' : 'Selesai'}
            </Button>
          )}
        </div>
      </div>

      <BottomPicker
        open={zonaPickerOpen}
        onClose={() => setZonaPickerOpen(false)}
        title="Zona waktu"
        options={zonaPickerOptions}
        value={zonaWaktu}
        onSelect={(id) => {
          setZonaWaktu(normalizeIndonesiaTimezone(id));
          setZonaPickerOpen(false);
        }}
      />
    </div>
  );
}
