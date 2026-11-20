import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useAppReload } from '@/hooks/use-app-reload';
import {
  ChevronDown,
  Clock,
  KeyRound,
  Moon,
  Save,
  Sun,
  SlidersHorizontal,
} from 'lucide-react';
import { BottomPicker } from '@/components/ui/bottom-picker';
import {
  formatDateTimeInZona,
  getIndonesiaTimezoneMeta,
  INDONESIA_TIMEZONES,
  normalizeIndonesiaTimezone,
} from '@/lib/indonesia-timezone';
import { AppSecuritySettingsForm } from '@/components/app-login-gate';
import { getSessionUser } from '@/lib/app-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DEFAULT_APP_SETTINGS,
  mergeAppSettings,
  type AppSettings,
} from '@/lib/app-settings';
import { useTheme } from '@/lib/theme';
import { appSelectClass } from '@/lib/form-styles';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { appCardClass } from '@/lib/surface-styles';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';

type SectionId = 'umum' | 'tampilan' | 'keamanan';

const SECTIONS: { id: SectionId; label: string; icon: typeof Sun }[] = [
  { id: 'umum', label: 'Umum', icon: SlidersHorizontal },
  { id: 'tampilan', label: 'Tampilan', icon: Sun },
  { id: 'keamanan', label: 'Keamanan', icon: KeyRound },
];

function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(appCardClass, 'p-3.5 space-y-3', className)}>
      {children}
    </div>
  );
}

/** Ganti PIN akun yang sedang login (pengawas & admin). */
function PinAkunSayaForm() {
  const user = getSessionUser();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const submit = async () => {
    if (newPin.trim().length < 4) {
      toast.error('PIN baru minimal 4 karakter');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('Konfirmasi PIN tidak sama');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, currentPin, newPin }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Gagal mengganti PIN');
        return;
      }
      toast.success('PIN akun berhasil diganti');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
        PIN akun saya ({user.nama})
      </h3>
      <Input
        type="password"
        inputMode="numeric"
        placeholder="PIN saat ini"
        value={currentPin}
        onChange={(e) => setCurrentPin(e.target.value)}
      />
      <Input
        type="password"
        inputMode="numeric"
        placeholder="PIN baru"
        value={newPin}
        onChange={(e) => setNewPin(e.target.value)}
      />
      <Input
        type="password"
        inputMode="numeric"
        placeholder="Ulangi PIN baru"
        value={confirmPin}
        onChange={(e) => setConfirmPin(e.target.value)}
      />
      <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => void submit()}>
        {loading ? 'Menyimpan…' : 'Ganti PIN saya'}
      </Button>
    </div>
  );
}

export default function Pengaturan() {
  const reload = useAppReload();
  const { theme, toggleTheme } = useTheme();
  const [section, setSection] = useState<SectionId>('umum');
  const [form, setForm] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [zonaPickerOpen, setZonaPickerOpen] = useState(false);

  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    if (settings) setForm(mergeAppSettings(settings));
  }, [settings]);

  const zonaMeta = useMemo(
    () => getIndonesiaTimezoneMeta(normalizeIndonesiaTimezone(form.zonaWaktu)),
    [form.zonaWaktu]
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

  const saveMutation = useMutation({
    mutationFn: async (payload: AppSettings) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save settings failed');
      return res.json();
    },
    onSuccess: () => {
      void reload('settings');
      toast.success('Pengaturan disimpan');
    },
    onError: () => toast.error('Gagal menyimpan pengaturan'),
  });

  const saveSettings = () => saveMutation.mutate(form);

  return (
    <PageWithPullRefresh
      keys={['settings']}
      className="w-full max-w-lg mx-auto space-y-4"
    >
      <div className="grid grid-cols-2 gap-2">
        {SECTIONS.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-sm border text-center transition-all active:scale-[0.98]',
                active
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm dark:shadow-none dark:border-emerald-400 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-emerald-300 dark:hover:border-emerald-400'
              )}
            >
              <Icon className={cn('w-5 h-5', active ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400 dark:text-slate-400')} />
              <span className="text-[11px] font-bold leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>

      {section === 'umum' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <SettingsCard>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Profil asrama</h2>
            <div className="space-y-2">
              <Label htmlFor="namaAsrama" className="text-xs">Nama asrama</Label>
              <Input
                id="namaAsrama"
                value={form.namaAsrama}
                onChange={(e) => setForm({ ...form, namaAsrama: e.target.value })}
                placeholder="Asrama Putra Al-Ikhlas"
              />
            </div>
          </SettingsCard>

          <SettingsCard>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
              Zona waktu
            </h2>
            <p className="text-[11px] text-slate-500 leading-snug">
              Hanya zona Indonesia (WIB, WITA, WIT). Default WITA (Asia/Makassar).
            </p>
            <div className="space-y-2">
              <Label className="text-xs">Zona operasional asrama</Label>
              <button
                type="button"
                onClick={() => setZonaPickerOpen(true)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-sm border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-900">
                    {zonaMeta.shortLabel} — {zonaMeta.name}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">{zonaMeta.hint}</span>
                </span>
                <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
              </button>
              <p className="text-[10px] text-slate-400">
                Jam sekarang:{' '}
                <span className="font-semibold text-slate-600 tabular-nums">
                  {formatDateTimeInZona(new Date(), form.zonaWaktu, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </p>
            </div>
          </SettingsCard>

          <BottomPicker
            open={zonaPickerOpen}
            onClose={() => setZonaPickerOpen(false)}
            title="Pilih zona waktu"
            description="WIB · WITA · WIT"
            searchPlaceholder="Cari WIB, WITA, WIT..."
            options={zonaPickerOptions}
            value={form.zonaWaktu}
            onSelect={(id) => {
              setForm((prev) => ({ ...prev, zonaWaktu: normalizeIndonesiaTimezone(id) }));
            }}
          />
          <Button type="button" className="w-full" disabled={saveMutation.isPending} onClick={saveSettings}>
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      )}

      {section === 'tampilan' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <SettingsCard>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Tampilan aplikasi</h2>
            <p className="text-[11px] text-slate-500 leading-snug">
              Default aplikasi terang. Tema tidak mengikuti mode HP — ubah di sini atau tombol bulan/matahari di
              beranda.
            </p>
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                toast.message('Tema aplikasi diubah');
              }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-sm border border-slate-200/80 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <span className="text-xs font-semibold text-slate-800">Tema aplikasi</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {theme === 'light' ? (
                  <>
                    <Sun className="w-4 h-4" />
                    Terang
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4" />
                    Gelap
                  </>
                )}
              </span>
            </button>
          </SettingsCard>
        </div>
      )}

      {section === 'keamanan' && (
        <div className="space-y-3 animate-in fade-in duration-150">
          <SettingsCard>
            <PinAkunSayaForm />
          </SettingsCard>
          <SettingsCard>
            <AppSecuritySettingsForm />
          </SettingsCard>
        </div>
      )}

    </PageWithPullRefresh>
  );
}
