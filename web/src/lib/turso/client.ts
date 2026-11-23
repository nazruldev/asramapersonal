/**
 * Shared Turso client for direct cloud reads/writes (internet wajib).
 */
import { createClient, type Client } from '@libsql/client/web';

export type TursoEnv = { url: string; authToken: string };

export function readTursoEnv(): TursoEnv | null {
  const url = (import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined)?.trim();
  const authToken = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string | undefined)?.trim();
  if (!url || !authToken) return null;
  return { url, authToken };
}

export function isTursoDirectEnabled(): boolean {
  return readTursoEnv() !== null;
}

export function assertOnlineOrThrow(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Tidak ada internet. Aplikasi wajib online ke Turso.');
  }
}

let cachedClient: Client | null = null;
let cachedKey = '';

/** Satu client per env; buat ulang jika URL/token berubah. */
export function getTursoClient(): Client {
  const cfg = readTursoEnv();
  if (!cfg) {
    throw new Error('Turso wajib. Isi VITE_TURSO_DATABASE_URL dan VITE_TURSO_AUTH_TOKEN.');
  }
  assertOnlineOrThrow();
  const key = `${cfg.url}|${cfg.authToken.slice(0, 12)}`;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = createClient({ url: cfg.url, authToken: cfg.authToken });
    cachedKey = key;
  }
  return cachedClient;
}

/** Ping ringan: pastikan koneksi + app_settings terbaca. */
export async function pingTurso(): Promise<{ ok: true; updatedAt: string | null }> {
  const client = getTursoClient();
  const res = await client.execute(
    `SELECT updated_at FROM app_settings WHERE id = 'default' LIMIT 1`
  );
  return {
    ok: true,
    updatedAt: res.rows[0]?.updated_at ? String(res.rows[0].updated_at) : null,
  };
}
