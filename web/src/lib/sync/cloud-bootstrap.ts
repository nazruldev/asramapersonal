import { createClient } from '@libsql/client/web';
import {
  markOnboardingComplete,
  mergeAppSettings,
  type AppSettings,
} from '@/lib/app-settings';
import { applySettingsFromCloud } from '@/lib/client-api';

export function isTursoConfigured(): boolean {
  const url = (import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined)?.trim();
  const token = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string | undefined)?.trim();
  return Boolean(url && token);
}

function tursoClient() {
  const url = (import.meta.env.VITE_TURSO_DATABASE_URL as string).trim();
  const authToken = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string).trim();
  return createClient({ url, authToken });
}

async function pullRemoteSettings(): Promise<AppSettings | null> {
  const client = tursoClient();
  const res = await client.execute(
    `SELECT payload, updated_at FROM app_settings WHERE id = 'default' LIMIT 1`
  );
  if (!res.rows.length) return null;
  const payload = String(res.rows[0].payload ?? '');
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<AppSettings>;
    return mergeAppSettings({ ...parsed, setupSelesai: true });
  } catch {
    return null;
  }
}

/** Push settings ke Turso (cepat, tanpa full snapshot). */
export async function pushSettingsToTurso(settings: AppSettings): Promise<void> {
  if (!isTursoConfigured()) return;
  const client = tursoClient();
  const payload = JSON.stringify(mergeAppSettings({ ...settings, setupSelesai: true }));
  const updatedAt = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO app_settings (id, payload, updated_at) VALUES ('default', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at`,
    args: [payload, updatedAt],
  });
}

export type CloudBootstrapResult = {
  cloudMode: boolean;
  appliedRemote: boolean;
  error?: string;
};

/**
 * Full-online boot: wajib berhasil pull/seed Turso.
 * Tidak ada fallback offline / login lokal jika cloud gagal.
 */
export async function bootstrapFromCloud(): Promise<CloudBootstrapResult> {
  if (!isTursoConfigured()) {
    return { cloudMode: false, appliedRemote: false };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Tidak ada koneksi internet. Mode full online Turso wajib online.');
  }

  markOnboardingComplete();

  const { runTursoSync } = await import('@/lib/sync/turso-sync');
  await runTursoSync();

  const remote = await pullRemoteSettings();
  if (remote) {
    await applySettingsFromCloud(remote);
    return { cloudMode: true, appliedRemote: true };
  }

  await applySettingsFromCloud(mergeAppSettings({ setupSelesai: true }));
  return { cloudMode: true, appliedRemote: false };
}
