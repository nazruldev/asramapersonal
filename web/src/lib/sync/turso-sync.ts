import { createClient, type Client } from '@libsql/client/web';
import { Network } from '@capacitor/network';
import {
  exportSyncSnapshot,
  importSyncSnapshot,
  reloadClientApiFromStorage,
} from '@/lib/client-api';
import { mergeAppSettings, markOnboardingComplete } from '@/lib/app-settings';
import type { OfflineDbSnapshot } from '@/lib/db/snapshot-types';
import {
  applyTombstonesToTurso,
  countTursoOperationalRows,
  readSnapshotFromTursoTables,
  writeSnapshotToTursoTables,
} from '@/lib/sync/turso-relational';
import { listSyncTombstones } from '@/lib/offline-db';
import { getSessionUser } from '@/lib/app-auth';

export type SyncStatus = {
  running: boolean;
  online: boolean;
  configured: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  lastResult: string | null;
};

type StatusListener = (status: SyncStatus) => void;

const listeners = new Set<StatusListener>();
const LAST_SYNC_KEY = 'asrama_last_sync_at';

let status: SyncStatus = {
  running: false,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  configured: false,
  lastSyncAt: null,
  lastError: null,
  lastResult: null,
};

let autoStarted = false;
let syncChain: Promise<void> = Promise.resolve();
let soonTimer: ReturnType<typeof setTimeout> | null = null;
/** Pause push selama boot/hydrate agar seed lokal kosong tidak menimpa cloud. */
let cloudPushPaused = false;

export function pauseCloudPush(paused: boolean): void {
  cloudPushPaused = paused;
}

type SnapshotShape = {
  santri?: unknown[];
  kamar?: unknown[];
  absensi?: unknown[];
  izin?: unknown[];
  settings?: Record<string, unknown>;
  [key: string]: unknown;
};

function emit() {
  for (const fn of listeners) fn({ ...status });
}

export function subscribeSyncStatus(fn: StatusListener): () => void {
  listeners.add(fn);
  fn({ ...status });
  return () => listeners.delete(fn);
}

export function getSyncStatus(): SyncStatus {
  return { ...status };
}

function readTursoConfig(): { url: string; authToken: string } | null {
  const url = (import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined)?.trim();
  const authToken = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string | undefined)?.trim();
  if (!url || !authToken) return null;
  return { url, authToken };
}

function createTursoClient(): Client {
  const cfg = readTursoConfig();
  if (!cfg) throw new Error('Turso belum dikonfigurasi (VITE_TURSO_DATABASE_URL / VITE_TURSO_AUTH_TOKEN)');
  return createClient({ url: cfg.url, authToken: cfg.authToken });
}

function readLastSyncAt(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

function writeLastSyncAt(iso: string) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    /* ignore */
  }
}

async function refreshConfiguredFlag() {
  status.configured = Boolean(readTursoConfig());
  status.lastSyncAt = readLastSyncAt();
  emit();
}

function isOperationallyEmpty(snapshot: SnapshotShape | null | undefined): boolean {
  if (!snapshot) return true;
  return (
    (snapshot.santri?.length ?? 0) === 0 &&
    (snapshot.kamar?.length ?? 0) === 0 &&
    (snapshot.absensi?.length ?? 0) === 0 &&
    (snapshot.izin?.length ?? 0) === 0
  );
}

async function ensureOnline(): Promise<void> {
  const net = await Network.getStatus().catch(() => ({
    connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  }));
  const online =
    (typeof navigator !== 'undefined' ? navigator.onLine : false) || Boolean(net.connected);
  status.online = online;
  emit();
  if (!online) {
    throw new Error('Tidak ada koneksi internet. Mode full online Turso wajib online.');
  }
}

async function applyRemotePayload(remotePayload: string, remoteUpdatedAt: string): Promise<void> {
  const parsed = JSON.parse(remotePayload) as SnapshotShape;
  if (parsed.settings) {
    parsed.settings = mergeAppSettings({
      ...(parsed.settings as object),
      setupSelesai: true,
    });
  }
  await importSyncSnapshot(parsed, remoteUpdatedAt);
  markOnboardingComplete();
  await reloadClientApiFromStorage();
}

async function readRemoteSnapshot(
  client: Client
): Promise<{ payload: string | null; updatedAt: string }> {
  const remoteRes = await client.execute(
    `SELECT payload, updated_at FROM app_data_snapshot WHERE id = 'default' LIMIT 1`
  );
  if (!remoteRes.rows.length) {
    return { payload: null, updatedAt: '1970-01-01T00:00:00.000Z' };
  }
  return {
    payload: String(remoteRes.rows[0].payload ?? '') || null,
    updatedAt: String(remoteRes.rows[0].updated_at ?? '1970-01-01T00:00:00.000Z'),
  };
}

async function writeLocalToTursoTables(
  client: Client,
  local: { snapshot: SnapshotShape; updatedAt: string },
  pushAt?: string
): Promise<string> {
  const at = pushAt || local.updatedAt || new Date().toISOString();
  const snap = local.snapshot as unknown as OfflineDbSnapshot;
  // Sumber utama: tabel entity (santri, kamar, kelas, …)
  // Upsert per baris — tidak wipe, jadi data device lain aman.
  await writeSnapshotToTursoTables(client, snap, 'upsert');
  // Propagasi penghapusan lokal: hapus baris remote + catat tombstone.
  const tombstones = await listSyncTombstones();
  await applyTombstonesToTurso(client, tombstones);

  // Cadangan JSON (kompatibilitas lama) — tetap diisi agar tidak kosong di dashboard lama
  const payload = JSON.stringify({
    ...local.snapshot,
    settings: mergeAppSettings({
      ...(local.snapshot.settings as object | undefined),
      setupSelesai: true,
    }),
  });
  await client.execute({
    sql: `INSERT INTO app_data_snapshot (id, payload, updated_at) VALUES ('default', ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at`,
    args: [payload, at],
  });

  return at;
}

async function applyTableSnapshot(
  snap: OfflineDbSnapshot,
  updatedAt: string
): Promise<void> {
  await importSyncSnapshot(snap as unknown as Record<string, unknown>, updatedAt);
  markOnboardingComplete();
  await reloadClientApiFromStorage();
}

/** Asrama aktif dari sesi login; null = super admin → tarik semua. */
function sessionAsramaScope(): string | null {
  const u = getSessionUser();
  if (!u) return null;
  if (u.activeAsramaId) return u.activeAsramaId;
  if (u.role !== 'super_admin') return u.asramaIds[0] ?? null;
  return null;
}

/** Pull dari tabel Turso → lokal. */
export async function pullFromTurso(): Promise<string> {
  await ensureOnline();
  const client = createTursoClient();
  const counts = await countTursoOperationalRows(client);

  if (counts.santri > 0 || counts.kamar > 0 || counts.kelas > 0) {
    const snap = await readSnapshotFromTursoTables(client, sessionAsramaScope());
    const at = new Date().toISOString();
    await applyTableSnapshot(snap, at);
    return `Pull tabel Turso (santri=${counts.santri}, kamar=${counts.kamar})`;
  }

  // Migrasi: tabel kosong tapi snapshot JSON masih ada
  const remote = await readRemoteSnapshot(client);
  if (remote.payload) {
    let parsed: SnapshotShape;
    try {
      parsed = JSON.parse(remote.payload) as SnapshotShape;
    } catch {
      return 'Cloud kosong (tabel & snapshot tidak valid)';
    }
    await applyRemotePayload(remote.payload, remote.updatedAt);
    if (!isOperationallyEmpty(parsed)) {
      await writeSnapshotToTursoTables(client, parsed as unknown as OfflineDbSnapshot);
      return `Migrasi snapshot → tabel Turso (${remote.updatedAt})`;
    }
    return `Pull snapshot kosong (${remote.updatedAt})`;
  }

  return 'Cloud kosong (belum ada data di tabel)';
}

/** Push lokal → tabel Turso (setelah simpan). */
export async function pushToTurso(): Promise<string> {
  await ensureOnline();
  const client = createTursoClient();
  const local = await exportSyncSnapshot();
  const at = await writeLocalToTursoTables(client, local, new Date().toISOString());
  return `Push ke tabel Turso (${at})`;
}

/**
 * Boot full-online (tabel entity):
 * - Tabel cloud kosong + lokal ada data → seed ke tabel
 * - Tabel cloud ada data → pull tabel
 * - Snapshot JSON ada tapi tabel kosong → migrasi ke tabel
 */
export async function bootstrapOnlineSnapshot(): Promise<string> {
  await ensureOnline();
  const client = createTursoClient();
  const local = await exportSyncSnapshot();
  const counts = await countTursoOperationalRows(client);
  const tablesEmpty = counts.santri === 0 && counts.kamar === 0;
  const localEmpty = isOperationallyEmpty(local.snapshot as SnapshotShape);

  if (tablesEmpty && !localEmpty) {
    const at = await writeLocalToTursoTables(client, local, new Date().toISOString());
    return `Seed tabel Turso dari lokal (${at})`;
  }

  if (!tablesEmpty) {
    const snap = await readSnapshotFromTursoTables(client, sessionAsramaScope());
    const at = new Date().toISOString();
    await applyTableSnapshot(snap, at);
    return `Pull tabel Turso (santri=${counts.santri}, kamar=${counts.kamar})`;
  }

  // Tabel kosong: coba migrasi dari snapshot JSON
  const remote = await readRemoteSnapshot(client);
  if (remote.payload) {
    let parsed: SnapshotShape | null = null;
    try {
      parsed = JSON.parse(remote.payload) as SnapshotShape;
    } catch {
      parsed = null;
    }
    if (parsed && !isOperationallyEmpty(parsed)) {
      await writeSnapshotToTursoTables(client, parsed as unknown as OfflineDbSnapshot);
      await applyRemotePayload(remote.payload, remote.updatedAt);
      return `Migrasi snapshot → tabel Turso (${remote.updatedAt})`;
    }
  }

  const at = await writeLocalToTursoTables(client, local, new Date().toISOString());
  return `Seed tabel Turso kosong (${at})`;
}

async function runWithStatus(fn: () => Promise<string>): Promise<SyncStatus> {
  const run = async () => {
    await refreshConfiguredFlag();
    if (!status.configured) {
      throw new Error('Isi VITE_TURSO_DATABASE_URL dan VITE_TURSO_AUTH_TOKEN di web/.env');
    }

    status.running = true;
    status.lastError = null;
    status.lastResult = null;
    emit();

    const result = await fn();

    const now = new Date().toISOString();
    writeLastSyncAt(now);
    status.lastSyncAt = now;
    status.lastResult = result;
    status.running = false;
    status.online = true;
    emit();
    return getSyncStatus();
  };

  const task = syncChain.then(run, run);
  syncChain = task.then(
    () => undefined,
    () => undefined
  );

  try {
    return await task;
  } catch (err) {
    status.running = false;
    status.lastError = err instanceof Error ? err.message : String(err);
    emit();
    throw err;
  }
}

/**
 * Sync penuh satu putaran: push (upsert + tombstone) lalu pull.
 * Push dulu agar data offline lokal ikut terkirim sebelum lokal diganti remote.
 * Kalau push gagal → pull tidak jalan → perubahan lokal yang belum terkirim aman.
 */
async function syncRound(): Promise<string> {
  const pushMsg = await pushToTurso();
  const pullMsg = await pullFromTurso();
  return `${pushMsg} • ${pullMsg}`;
}

/** Boot / reconnect / berkala: push lalu pull. */
export async function runTursoSync(): Promise<SyncStatus> {
  return runWithStatus(() => syncRound());
}

/** Manual refresh dari cloud. */
export async function runTursoPull(): Promise<SyncStatus> {
  return runWithStatus(() => pullFromTurso());
}

/** Simpan → push segera ke Turso. */
export async function pushToTursoNow(): Promise<SyncStatus> {
  return runWithStatus(() => pushToTurso());
}

/**
 * Setelah CRUD: antre push singkat (debounce kecil agar batch tulis berdekatan).
 * Full online: tidak menunggu lama; tetap push, bukan sync LWW offline.
 */
export function scheduleSyncSoon(delayMs = 400): void {
  if (!readTursoConfig()) return;
  if (cloudPushPaused) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    status.online = false;
    status.lastError = 'Offline — perubahan belum terkirim ke Turso';
    emit();
    return;
  }
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void pushToTursoNow().catch((err) => {
      console.warn('pushToTursoNow failed:', err);
    });
  }, delayMs);
}

/** Await push setelah save (prefer ini dari client-api). */
export async function awaitCloudPushAfterSave(): Promise<void> {
  if (!readTursoConfig()) return;
  if (cloudPushPaused) return;
  if (soonTimer) {
    clearTimeout(soonTimer);
    soonTimer = null;
  }
  await pushToTursoNow();
}

/** Auto pull berkala + online/offline listeners (full online). */
export function startAutoSync(): void {
  if (autoStarted || typeof window === 'undefined') return;
  if (!readTursoConfig()) {
    void refreshConfiguredFlag();
    return;
  }
  autoStarted = true;
  void refreshConfiguredFlag();

  const maybeSync = () => {
    if (!readTursoConfig()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (cloudPushPaused) return;
    if (!navigator.onLine) {
      status.online = false;
      emit();
      return;
    }
    void runTursoSync().catch((err) => {
      console.warn('Auto sync skipped/failed:', err);
    });
  };

  window.addEventListener('online', () => {
    status.online = true;
    status.lastError = null;
    emit();
    void runTursoSync().catch((err) => {
      console.warn('Online reconnect sync failed:', err);
    });
  });
  window.addEventListener('offline', () => {
    status.online = false;
    status.lastError = 'Tidak ada koneksi internet';
    emit();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeSync();
  });

  void Network.addListener('networkStatusChange', (s) => {
    status.online = s.connected;
    emit();
    if (s.connected) {
      void runTursoSync().catch((err) => {
        console.warn('Network reconnect sync failed:', err);
      });
    }
  }).catch(() => {
    /* web/Electron tanpa plugin */
  });

  window.setInterval(maybeSync, 2 * 60 * 1000);
  console.info('[sync] mode=offline-first-delta-sync');
}
