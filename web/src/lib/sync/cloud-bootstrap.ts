import { markOnboardingComplete, type AppSettings } from '@/lib/app-settings';
import { applySettingsFromCloud } from '@/lib/client-api';
import { getTursoClient, isTursoDirectEnabled, pingTurso } from '@/lib/turso/client';
import { loadSettingsFromTurso, saveSettingsToTurso } from '@/lib/turso/repos/settings';
import { ensureTursoSchemaPatches } from '@/lib/sync/turso-relational';

export function isTursoConfigured(): boolean {
  return isTursoDirectEnabled();
}

/** Mode full-online: Turso adalah satu-satunya sumber kebenaran. */
export function isTursoCloudAuthority(): boolean {
  return isTursoConfigured();
}

function assertOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Internet wajib. Aplikasi hanya berjalan online ke Turso.');
  }
}

/** Push settings ke Turso (cepat, tanpa full snapshot). */
export async function pushSettingsToTurso(settings: AppSettings): Promise<void> {
  if (!isTursoConfigured()) return;
  assertOnline();
  await saveSettingsToTurso(settings);
}

export type CloudBootstrapResult = {
  cloudMode: boolean;
  appliedRemote: boolean;
  error?: string;
};

/**
 * Boot direct-Turso: cek internet + ping cloud + load settings.
 * Tidak seed dari lokal / tidak pull snapshot penuh ke RAM sebagai SoT.
 * Entity di-fetch live per request API.
 */
export async function bootstrapFromCloud(): Promise<CloudBootstrapResult> {
  if (!isTursoConfigured()) {
    throw new Error('Turso wajib. Isi VITE_TURSO_DATABASE_URL dan VITE_TURSO_AUTH_TOKEN.');
  }

  assertOnline();
  markOnboardingComplete();

  const client = getTursoClient();
  await ensureTursoSchemaPatches(client);
  await pingTurso();

  const remote = await loadSettingsFromTurso();
  await applySettingsFromCloud(remote);
  return { cloudMode: true, appliedRemote: true };
}
