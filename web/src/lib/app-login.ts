import { verifySecret } from '@/lib/app-auth';
import { mergeAppSettings, type AppSettings, type Pengguna } from '@/lib/app-settings';

export type LoginResult = { ok: true } | { ok: false; error: string };

export type AccountOption = { id: string; nama: string; role: Pengguna['role'] };

/** Daftar akun aktif untuk layar pilih akun. */
export async function listLoginAccounts(): Promise<AccountOption[]> {
  try {
    const res = await fetch('/api/auth/accounts');
    if (!res.ok) return [];
    const data = (await res.json()) as AccountOption[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Login per akun (pilih akun + PIN). */
export async function attemptAccountLogin(
  id: string,
  pin: string
): Promise<(LoginResult & { user?: Omit<Pengguna, 'pinHash'> })> {
  try {
    const res = await fetch('/api/auth/login-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      user?: Omit<Pengguna, 'pinHash'>;
    };
    if (res.ok && data.ok && data.user) return { ok: true, user: data.user };
    return { ok: false, error: data.error || 'PIN salah' };
  } catch {
    return { ok: false, error: 'Gagal memverifikasi PIN' };
  }
}

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
