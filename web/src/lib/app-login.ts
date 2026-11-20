import { verifySecret } from '@/lib/app-auth';
import { mergeAppSettings, type AppSettings } from '@/lib/app-settings';

export type LoginResult = { ok: true } | { ok: false; error: string };

async function verifyAgainstSettings(password: string): Promise<LoginResult> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) {
      return {
        ok: false,
        error: 'Data aplikasi tidak tersedia. Pastikan server jalan (npm run dev) lalu muat ulang halaman.',
      };
    }
    const raw = (await res.json()) as Partial<AppSettings>;
    const settings: AppSettings = mergeAppSettings(raw);
    if (verifySecret(password, settings.passwordHash)) return { ok: true };
    return { ok: false, error: 'Kata sandi salah' };
  } catch {
    return { ok: false, error: 'Gagal memverifikasi kata sandi' };
  }
}

/** Login via API auth; jika endpoint belum ada (server lama), verifikasi dari /api/settings. */
export async function attemptAppLogin(password: string): Promise<LoginResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.status === 401) {
      let data: { error?: string } = {};
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        /* ignore */
      }
      return { ok: false, error: data.error || 'Kata sandi salah' };
    }

    if (res.ok) {
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as { ok?: boolean; error?: string };
      } catch {
        return verifyAgainstSettings(password);
      }
      if (data.ok) return { ok: true };
      return { ok: false, error: data.error || 'Kata sandi salah' };
    }

    if (res.status === 404 || res.status === 405) {
      return verifyAgainstSettings(password);
    }

    return verifyAgainstSettings(password);
  } catch {
    return verifyAgainstSettings(password);
  }
}
