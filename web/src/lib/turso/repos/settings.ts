/**
 * Settings / auth data — selalu baca & tulis langsung ke Turso app_settings.
 */
import { mergeAppSettings, type AppSettings } from '@/lib/app-settings';
import { getTursoClient, isTursoDirectEnabled } from '@/lib/turso/client';

export async function loadSettingsFromTurso(): Promise<AppSettings> {
  const client = getTursoClient();
  const res = await client.execute(
    `SELECT payload FROM app_settings WHERE id = 'default' LIMIT 1`
  );
  const payload = res.rows[0]?.payload ? String(res.rows[0].payload) : '';
  if (!payload) {
    return mergeAppSettings({ setupSelesai: true });
  }
  try {
    return mergeAppSettings({
      ...(JSON.parse(payload) as Partial<AppSettings>),
      setupSelesai: true,
    });
  } catch {
    return mergeAppSettings({ setupSelesai: true });
  }
}

export async function saveSettingsToTurso(settings: AppSettings): Promise<void> {
  const client = getTursoClient();
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

/** Load settings hanya jika Turso aktif; selain itu kembalikan null. */
export async function tryLoadSettingsFromTurso(): Promise<AppSettings | null> {
  if (!isTursoDirectEnabled()) return null;
  return loadSettingsFromTurso();
}
