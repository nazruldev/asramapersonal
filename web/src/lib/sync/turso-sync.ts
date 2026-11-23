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
  upsertKamarRowsToTurso,
  writeSnapshotToTursoTables,
} from '@/lib/sync/turso-relational';
import {
  clearAppliedTombstones,
  listSyncTombstones,
  setSyncMeta,
} from '@/lib/offline-db';
import { getSessionUser } from '@/lib/app-auth';
import { publishSyncSignal, startAblyRealtime } from '@/lib/sync/ably-realtime';

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
/** Gate: jangan push sebelum hydrate/bootstrap cloud selesai. */
let cloudWritesEnabled = false;

/** Aktifkan push setelah boot Turso sukses. */
export function setCloudWritesEnabled(enabled: boolean): void {
  cloudWritesEnabled = enabled;
}

/** @deprecated Alias gate boot — setCloudWritesEnabled(!paused). */
export function pauseCloudPush(paused: boolean): void {
  cloudWritesEnabled = !paused;
}

/** Tunggu gate boot selesai agar CRUD tidak tersimpan lokal-only tanpa Turso/Ably. */
async function waitCloudWritesEnabled(timeoutMs = 20_000): Promise<boolean> {
  if (cloudWritesEnabled) return true;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 150));
    if (cloudWritesEnabled) return true;
  }
  return cloudWritesEnabled;
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
    throw new Error('Tidak ada koneksi internet. Aplikasi hanya berjalan online ke Turso.');
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
  if (tombstones.length) {
    await applyTombstonesToTurso(client, tombstones);
    await clearAppliedTombstones(tombstones);
  }

  // Cadangan JSON (kompatibilitas lama) — foto besar di-strip agar payload tidak meledak.
  const snapForLegacy = { ...local.snapshot } as SnapshotShape;
  if (Array.isArray(snapForLegacy.santri)) {
    snapForLegacy.santri = (snapForLegacy.santri as Record<string, unknown>[]).map((s) => {
      const foto = s.foto != null ? String(s.foto) : '';
      if (foto.length > 500) return { ...s, foto: '' };
      return s;
    });
  }
  const payload = JSON.stringify({
    ...snapForLegacy,
    settings: mergeAppSettings({
      ...(snapForLegacy.settings as object | undefined),
      setupSelesai: true,
    }),
  });
  try {
    await client.execute({
      sql: `INSERT INTO app_data_snapshot (id, payload, updated_at) VALUES ('default', ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              payload = excluded.payload,
              updated_at = excluded.updated_at`,
      args: [payload, at],
    });
  } catch (err) {
    console.warn('[turso] legacy snapshot JSON skip (payload besar?):', err);
  }

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

const PULL_CURSOR_KEY = 'pull_cursor';
const PULL_SCOPE_KEY = 'pull_scope';

/**
 * Direct Turso: tidak lagi mengisi RAM sebagai SoT.
 * Hanya pastikan cloud reachable; UI refetch lewat /api (live SELECT).
 */
export async function pullFromTurso(): Promise<string> {
  await ensureOnline();
  const client = createTursoClient();
  const counts = await countTursoOperationalRows(client);
  await setSyncMeta(PULL_CURSOR_KEY, new Date().toISOString());
  await setSyncMeta(PULL_SCOPE_KEY, sessionAsramaScope() ?? '');
  return `Cloud siap (santri=${counts.santri}, kamar=${counts.kamar}) — refetch via API`;
}

/** Push lokal → tabel Turso (setelah simpan). */
export async function pushToTurso(): Promise<string> {
  await ensureOnline();
  const client = createTursoClient();
  const local = await exportSyncSnapshot();
  const at = await writeLocalToTursoTables(client, local, new Date().toISOString());
  void publishSyncSignal('push');
  return `Push ke tabel Turso (${at})`;
}

/**
 * Boot direct-Turso: jangan seed dari lokal ke cloud.
 * Pastikan tabel reachable; data dibaca live per request.
 */
export async function bootstrapOnlineSnapshot(): Promise<string> {
  await ensureOnline();
  const client = createTursoClient();
  const { ensureTursoSchemaPatches } = await import('@/lib/sync/turso-relational');
  await ensureTursoSchemaPatches(client);
  const counts = await countTursoOperationalRows(client);
  return `Boot direct Turso (santri=${counts.santri}, kamar=${counts.kamar})`;
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

/** Direct mode: ping cloud saja; UI di-refresh lewat reloadAll / fetch API. */
async function syncRound(): Promise<string> {
  return pullFromTurso();
}

/** Boot / reconnect / berkala: pull dari Turso. */
export async function runTursoSync(): Promise<SyncStatus> {
  return runWithStatus(() => syncRound());
}

/**
 * Boot wajib: pull cloud; seed dari RAM hanya jika tabel Turso kosong.
 */
export async function runCloudBootstrap(): Promise<SyncStatus> {
  return runWithStatus(() => bootstrapOnlineSnapshot());
}

/** Manual refresh dari cloud — full pull (reset kursor delta). */
export async function runTursoPull(): Promise<SyncStatus> {
  return runWithStatus(async () => {
    await setSyncMeta(PULL_CURSOR_KEY, '');
    await setSyncMeta(PULL_SCOPE_KEY, '');
    return pullFromTurso();
  });
}

/** Simpan → push segera ke Turso. */
export async function pushToTursoNow(): Promise<SyncStatus> {
  return runWithStatus(() => pushToTurso());
}

/**
 * Setelah CRUD: antre pull singkat (bukan full push).
 * Mutasi sudah menulis baris ke Turso; ini hanya menyegarkan dari cloud.
 */
export function scheduleSyncSoon(delayMs = 400): void {
  if (!readTursoConfig()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    status.online = false;
    status.lastError = 'Offline — tidak bisa menyimpan ke Turso';
    emit();
    return;
  }
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => {
    soonTimer = null;
    void (async () => {
      if (!(await waitCloudWritesEnabled(8_000))) {
        console.warn('scheduleSyncSoon skipped — cloud writes belum siap');
        return;
      }
      await runTursoSync();
    })().catch((err) => {
      console.warn('scheduleSyncSoon pull failed:', err);
    });
  }, delayMs);
}

async function assertCloudWritable(offlineMsg: string): Promise<Client> {
  if (!readTursoConfig()) {
    throw new Error('Turso belum dikonfigurasi');
  }
  if (!(await waitCloudWritesEnabled())) {
    throw new Error('Sync cloud belum siap. Tunggu sebentar lalu coba lagi.');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    status.online = false;
    status.lastError = offlineMsg;
    emit();
    throw new Error(offlineMsg);
  }
  await ensureOnline();
  return createTursoClient();
}

function markScopedPushOk(result: string): void {
  const now = new Date().toISOString();
  writeLastSyncAt(now);
  status.lastSyncAt = now;
  status.lastResult = result;
  status.lastError = null;
  status.online = true;
  emit();
}

/**
 * Remote DB: upsert hanya entity yang ada di partial (field undefined = skip).
 * Tidak mengirim snapshot penuh / foto santri yang tidak relevan.
 */
export async function pushScopedToTurso(
  partial: Partial<OfflineDbSnapshot>,
  reason = 'scoped'
): Promise<void> {
  if (!readTursoConfig()) return;
  try {
    const client = await assertCloudWritable('Offline — tidak bisa menyimpan ke Turso');
    await writeSnapshotToTursoTables(client, partial, 'upsert');
    markScopedPushOk(`Push scoped (${reason})`);
    void publishSyncSignal(reason);
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    emit();
    console.warn('pushScopedToTurso failed:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/** Hapus baris remote dari tombstone lokal (tanpa full snapshot). */
export async function flushTombstonesToTurso(reason = 'delete'): Promise<void> {
  if (!readTursoConfig()) return;
  try {
    const client = await assertCloudWritable('Offline — tidak bisa menghapus di Turso');
    const tombstones = await listSyncTombstones();
    if (!tombstones.length) return;
    await applyTombstonesToTurso(client, tombstones);
    await clearAppliedTombstones(tombstones);
    markScopedPushOk(`Tombstone ${tombstones.length} baris`);
    void publishSyncSignal(reason);
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    emit();
    console.warn('flushTombstonesToTurso failed:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Push 1+ baris kamar langsung ke Turso (cepat).
 * Dipakai setelah tambah/edit kamar — tanpa full snapshot (foto santri besar).
 */
export async function pushKamarRowsNow(rows: Record<string, unknown>[]): Promise<void> {
  if (!rows.length || !readTursoConfig()) return;
  try {
    const client = await assertCloudWritable('Offline — tidak bisa menyimpan kamar ke Turso');
    await upsertKamarRowsToTurso(client, rows);
    markScopedPushOk(`Push ${rows.length} kamar ke Turso`);
    void publishSyncSignal('kamar');
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    emit();
    console.warn('pushKamarRowsNow failed:', err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * Setelah save: full push HANYA untuk impor/bootstrap (tanpa scope).
 * CRUD harian harus pakai pushScopedToTurso / pushKamarRowsNow.
 */
export async function awaitCloudPushAfterSave(): Promise<void> {
  if (!readTursoConfig()) return;
  if (!(await waitCloudWritesEnabled())) {
    throw new Error('Sync cloud belum siap. Tunggu sebentar lalu coba lagi.');
  }
  if (soonTimer) {
    clearTimeout(soonTimer);
    soonTimer = null;
  }
  await pushToTursoNow();
}

/** Auto pull berkala + online/offline listeners (full-online Turso). */
export function startAutoSync(): void {
  if (autoStarted || typeof window === 'undefined') return;
  if (!readTursoConfig()) {
    void refreshConfiguredFlag();
    return;
  }
  autoStarted = true;
  void refreshConfiguredFlag();

  // Ably: device lain push → pull + refresh UI store (supaya list kamar/santri ikut berubah).
  let uiReloadTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshUiAfterRemotePull = () => {
    if (uiReloadTimer) clearTimeout(uiReloadTimer);
    uiReloadTimer = setTimeout(() => {
      uiReloadTimer = null;
      void import('@/store/app-store')
        .then(({ useAppStore }) => useAppStore.getState().reloadAll())
        .catch((err) => console.warn('[ably] UI reload failed:', err));
    }, 150);
  };

  startAblyRealtime((signal) => {
    console.info('[ably] remote change from', signal.deviceId, signal.reason ?? '');
    // Direct Turso: jangan apply snapshot ke RAM — cukup refetch UI (/api → live SELECT).
    refreshUiAfterRemotePull();
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      try {
        new Notification('Asrama Manager', {
          body: 'Data asrama diperbarui di cloud',
          silent: false,
        });
      } catch {
        /* ignore */
      }
    }
  });

  const maybeSync = async (): Promise<boolean> => {
    if (!readTursoConfig()) return true;
    if (!cloudWritesEnabled) return true;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true;
    if (!navigator.onLine) {
      status.online = false;
      status.lastError = 'Offline — koneksi Turso terputus';
      emit();
      return false;
    }
    try {
      await runTursoSync();
      return true;
    } catch (err) {
      console.warn('Auto sync skipped/failed:', err);
      return false;
    }
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
    if (document.visibilityState === 'visible') void maybeSync();
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

  // Cadangan bila Ably putus. Ably handle sync realtime antar device.
  const BASE_DELAY = 3 * 60 * 1000;
  const MAX_DELAY = 10 * 60 * 1000;
  let delay = BASE_DELAY;
  const scheduleNext = () => {
    window.setTimeout(() => {
      void maybeSync().then((ok) => {
        delay = ok ? BASE_DELAY : Math.min(delay * 2, MAX_DELAY);
        scheduleNext();
      });
    }, delay);
  };
  // Sync segera saat boot (jangan tunggu interval 2 menit) — penting Electron lokal kosong.
  void maybeSync().then((ok) => {
    delay = ok ? BASE_DELAY : Math.min(delay * 2, MAX_DELAY);
    scheduleNext();
  });
  console.info('[sync] mode=direct-turso + ably-refetch');
}
