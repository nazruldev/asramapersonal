/**
 * Live entity snapshot dari tabel Turso (bukan cache sync lama).
 */
import type { OfflineDbSnapshot } from '@/lib/db/snapshot-types';
import { getSessionUser } from '@/lib/app-auth';
import {
  ensureTursoSchemaPatches,
  readSnapshotFromTursoTables,
  writeSnapshotToTursoTables,
  type TursoWriteSnapshot,
} from '@/lib/sync/turso-relational';
import { getTursoClient } from '@/lib/turso/client';

/** Scope asrama untuk query Turso (pengawas / active asrama). */
export function liveAsramaScope(): string | null {
  const user = getSessionUser();
  if (!user) return null;
  if (user.role === 'pengawas') {
    return user.activeAsramaId ?? user.asramaIds[0] ?? null;
  }
  if (user.activeAsramaId) return user.activeAsramaId;
  return null;
}

export async function loadLiveSnapshot(
  asramaId?: string | null
): Promise<OfflineDbSnapshot> {
  const client = getTursoClient();
  await ensureTursoSchemaPatches(client);
  return readSnapshotFromTursoTables(client, asramaId ?? liveAsramaScope());
}

/** Upsert partial entity langsung ke Turso. */
export async function upsertLiveSnapshot(partial: TursoWriteSnapshot): Promise<void> {
  const client = getTursoClient();
  await ensureTursoSchemaPatches(client);
  await writeSnapshotToTursoTables(client, partial, 'upsert');
}

export type LiveHydrateMode = 'settings' | 'entities' | 'all';

/**
 * Path → mode hydrate.
 * Auth/settings hanya settings; entity GET/WRITE = entities (+ settings bila perlu).
 */
export function hydrateModeForPath(pathname: string, method: string): LiveHydrateMode {
  const m = method.toUpperCase();
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/asrama') ||
    pathname.startsWith('/api/pengguna') ||
    pathname === '/api/settings' ||
    pathname === '/api/onboarding/complete'
  ) {
    return 'settings';
  }
  // Wilayah = data lokal bundel, cukup settings.
  if (pathname.startsWith('/api/wilayah')) {
    return 'settings';
  }
  // Pembayaran butuh daftar santri (scope) + settings.
  if (pathname.startsWith('/api/pembayaran')) {
    return 'all';
  }
  if (m === 'GET' || m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') {
    return 'all';
  }
  return 'all';
}
