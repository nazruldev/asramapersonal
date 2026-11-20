import { Capacitor } from '@capacitor/core';
import {
  DEFAULT_APP_SETTINGS,
  isSetupSelesai,
  markOnboardingComplete,
  mergeAppSettings,
  type AppSettings,
} from './app-settings';
import {
  defaultAsramaId,
  ensureAccountsSeeded,
  handleAsramaCreate,
  handleAsramaDelete,
  handleAsramaList,
  handleAsramaUpdate,
  handleAuthAccounts,
  handleAuthChangePassword,
  handleAuthLogin,
  handleAuthLoginAccount,
  handleAuthRecoveryQuestions,
  handleAuthResetPassword,
  handleAuthSecurityQuestions,
  handlePenggunaChangePin,
  handlePenggunaCreate,
  handlePenggunaDelete,
  handlePenggunaList,
  handlePenggunaResetPin,
  handlePenggunaUpdate,
  snapshotAuthSettings,
} from './auth-api';
import { getSessionUser } from './app-auth';
import { handleOnboardingComplete, type OnboardingCompleteBody } from './onboarding-api';
import { buildDefaultKelasRecords, type KelasRecord } from './kelas-defaults';
import type { SecurityQuestionId } from './app-auth';
import { isSantriOnIzinForDate, type IzinRow } from './izin-group';
import { getInitialDbSnapshot } from './initial-db';
import {
  buildGeneratedEntries,
  dateRangeForMonths,
  syncPenjadwalanPresets,
  upsertPenjadwalanPreset,
  type PenjadwalanEntry,
  type PenjadwalanPreset,
} from './penjadwalan';
import { pickSantriLongestInKamar } from './kamar-ketua';
import {
  filterPenjadwalanWithoutReplacing,
  purgeSantriRelatedData,
} from './santri-purge';
import {
  buildSantriKamarRiwayatResponse,
  logSantriKamarAssignmentChange,
  recordSantriKamarRiwayat,
  type SantriKamarRiwayatRow,
} from './santri-kamar-riwayat';
import wilayahBundled from '@/data/wilayah-index.json';
import type { WilayahIndex } from './wilayah-types';
import { getWilayahIndexSync, setWilayahIndexCache } from './wilayah-index';
import { handleWilayahApi } from './wilayah-api-handlers';
import { handlePembayaranApi } from './pembayaran-api';
import { clearAllPembayaran, purgePembayaranForSantri } from './pembayaran-store';
import {
  importLegacyLocalStorageJson,
  initOfflineSqlite,
  loadOfflineDbSnapshot,
  replaceOfflineDbSnapshot,
  saveOfflineDbSnapshot,
  shouldPersistToSqlite,
  commitSqlTables,
  SQL_ENTITIES_ALL,
  sqlDeleteSantriCascade,
  type SqlEntity,
} from './offline-db';
import { paginateInMemory, parsePageParams } from './api-pagination';
import { mapSqliteErrorToUserMessage, SqlForeignKeyError } from './sqlite-fk';
import {
  sqlCountPenghuniKamar,
  sqlCountSantri,
  sqlCountIzinBelum,
  sqlGetSantriById,
  sqlListSantriSummary,
  sqlPickLongestInKamar,
  sqlQuerySantriPage,
} from './sql-santri-read';
import {
  sqlBumpSantriPelanggaran,
  sqlDeleteAbsensiById,
  sqlDeleteIzinById,
  sqlDeletePenjadwalanById,
  sqlDeletePenjadwalanByJenis,
  sqlDeletePenjadwalanJenisBulan,
  sqlDeletePenjadwalanJenisRange,
  sqlDeletePenjadwalanPresetByJenis,
  sqlDeletePembinaanById,
  sqlRecalculateSantriPelanggaran,
  sqlEnrichPenjadwalan,
  sqlFindAbsensiByKey,
  sqlFindIzinBelumForSantri,
  sqlGetKamarIdsSet,
  sqlGetSantriIdsSet,
  sqlInsertIzin,
  sqlInsertPembinaan,
  sqlInsertRiwayatKamar,
  sqlDashboardAbsensiStats,
  sqlListAbsensiEnriched,
  sqlListAbsensiForDate,
  sqlListAbsensiInRange,
  sqlListIzinInRange,
  sqlListPembinaanInRange,
  sqlListIzinEnriched,
  sqlListKamarPenjadwalan,
  sqlListKamarWithPenghuni,
  sqlListPembinaanEnriched,
  sqlListPenjadwalanRaw,
  sqlListRiwayatKamarForSantri,
  sqlListSantriPenjadwalan,
  sqlLoadFullSnapshotForBackup,
  sqlDeletePenjadwalanByKamarId,
  sqlSetSantriPelanggaran,
  sqlClearAllAbsensi,
  sqlClearAllIzin,
  sqlClearAllPelanggaran,
  sqlUpdateIzinRow,
  sqlVacateKamarResidents,
  sqlUpsertAbsensiRow,
  sqlUpsertKamarRow,
  sqlUpsertPenjadwalanRow,
  sqlUpsertSantriRow,
  requireSantriInDatabase,
} from './sql-entity-io';

/** Tabel SQLite yang disinkronkan per domain (unit of work). */
const SQL_SCOPE = {
  settings: ['settings'] as SqlEntity[],
  santri: ['santri', 'riwayat_kamar', 'kamar'] as SqlEntity[],
  kamar: ['kamar', 'santri', 'riwayat_kamar'] as SqlEntity[],
  kamarDelete: ['kamar', 'santri', 'penjadwalan'] as SqlEntity[],
  kelas: ['kelas'] as SqlEntity[],
  kegiatan: ['kegiatan'] as SqlEntity[],
  jadwal: ['penjadwalan', 'penjadwalanPreset'] as SqlEntity[],
  absensi: ['absensi'] as SqlEntity[],
  izin: ['izin'] as SqlEntity[],
  pembinaan: ['pembinaan'] as SqlEntity[],
};

export type BackupClearScope = 'absensi' | 'izin' | 'pelanggaran';

const BACKUP_CLEAR_SCOPES: BackupClearScope[] = ['absensi', 'izin', 'pelanggaran'];

export async function clearBackupScope(scope: BackupClearScope): Promise<void> {
  await flushClientApiPersist();
  switch (scope) {
    case 'absensi':
      db.absensi = [];
      if (shouldPersistToSqlite()) await sqlClearAllAbsensi();
      else await saveDb(SQL_SCOPE.absensi);
      break;
    case 'izin':
      db.izin = [];
      if (shouldPersistToSqlite()) await sqlClearAllIzin();
      else await saveDb(SQL_SCOPE.izin);
      break;
    case 'pelanggaran':
      db.pembinaan = [];
      for (const s of db.santri) {
        s.jumlah_pelanggaran = 0;
      }
      if (shouldPersistToSqlite()) await sqlClearAllPelanggaran();
      else await saveDb([...SQL_SCOPE.pembinaan, ...SQL_SCOPE.santri]);
      break;
    default:
      throw new Error('scope tidak valid');
  }
}

setWilayahIndexCache(wilayahBundled as WilayahIndex);

const STORAGE_KEY = 'asrama_manager_db';
const DATA_UPDATED_AT_KEY = 'asrama_data_updated_at';

function bumpDataUpdatedAt(): string {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(DATA_UPDATED_AT_KEY, now);
  } catch {
    /* ignore */
  }
  return now;
}

export function getDataUpdatedAt(): string {
  try {
    return localStorage.getItem(DATA_UPDATED_AT_KEY) || '1970-01-01T00:00:00.000Z';
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

type DbState = {
  santri: Record<string, unknown>[];
  kamar: Record<string, unknown>[];
  kelas: KelasRecord[];
  kegiatan: Record<string, unknown>[];
  penjadwalan: Record<string, unknown>[];
  penjadwalanPreset: PenjadwalanPreset[];
  absensi: Record<string, unknown>[];
  izin: Record<string, unknown>[];
  pembinaan: Record<string, unknown>[];
  riwayat_kamar: SantriKamarRiwayatRow[];
  settings: AppSettings;
};

const omitPoin = <T extends Record<string, unknown>>(row: T) => {
  const { poin: _poin, ...rest } = row;
  return rest;
};

const normalizeDb = (parsed: Record<string, unknown>): DbState => ({
  santri: ((parsed.santri as Record<string, unknown>[]) ?? []).map((s) => omitPoin(s)),
  kamar: (parsed.kamar as Record<string, unknown>[]) ?? [],
  kelas: (parsed.kelas as KelasRecord[]) ?? [],
  kegiatan: (parsed.kegiatan as Record<string, unknown>[]) ?? [],
  penjadwalan: (parsed.penjadwalan as Record<string, unknown>[]) ?? [],
  penjadwalanPreset: (parsed.penjadwalanPreset as PenjadwalanPreset[]) ?? [],
  absensi: (parsed.absensi as Record<string, unknown>[]) ?? [],
  izin: (parsed.izin as Record<string, unknown>[]) ?? [],
  pembinaan: ((parsed.pembinaan as Record<string, unknown>[]) ?? []).map((p) => omitPoin(p)),
  riwayat_kamar: (parsed.riwayat_kamar as SantriKamarRiwayatRow[]) ?? [],
  settings: mergeAppSettings((parsed.settings as Partial<AppSettings>) || {}),
});

let db: DbState = normalizeDb({});

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const seedDefaultKelasIfEmpty = () => {
  if (db.kelas.length > 0) return false;
  db.kelas = buildDefaultKelasRecords(newId, { stableIds: true });
  return true;
};

const seedDefaultsIfEmpty = () => {
  if (seedDefaultKelasIfEmpty()) void saveDb();
};

const reconcilePenjadwalanPresets = () => {
  db.penjadwalanPreset = syncPenjadwalanPresets(
    db.penjadwalan as PenjadwalanEntry[],
    db.penjadwalanPreset,
    newId
  );
};

let dbLoaded = false;
let dbLoadPromise: Promise<void> | null = null;
let persistChain: Promise<void> = Promise.resolve();

const applyLoadedSnapshot = (raw: string) => {
  db = normalizeDb(JSON.parse(raw) as Record<string, unknown>);
  afterDbHydrated();
};

const applyRelationalSnapshot = (snapshot: ReturnType<typeof normalizeDb>) => {
  db = snapshot;
  afterDbHydrated();
};

const afterDbHydrated = () => {
  if (ensureAccountsSeeded(db.settings, newId)) {
    void saveDb(SQL_SCOPE.settings);
  }
  assignDefaultAsramaToRows();
  if (db.settings.setupSelesai === true) {
    markOnboardingComplete();
  }
  const presetCountBefore = db.penjadwalanPreset.length;
  reconcilePenjadwalanPresets();
  if (db.penjadwalanPreset.length !== presetCountBefore) {
    void saveDb();
  }
  seedDefaultsIfEmpty();
};

const snapshotFromMemory = (): Parameters<typeof saveOfflineDbSnapshot>[0] => ({
  santri: db.santri,
  kamar: db.kamar,
  kelas: db.kelas,
  kegiatan: db.kegiatan,
  penjadwalan: db.penjadwalan,
  penjadwalanPreset: db.penjadwalanPreset,
  absensi: db.absensi,
  izin: db.izin,
  pembinaan: db.pembinaan,
  riwayat_kamar: db.riwayat_kamar,
  settings: db.settings,
});

const loadDbAsync = async () => {
  try {
    if (shouldPersistToSqlite()) {
      await initOfflineSqlite();
      // MVP: full snapshot — core-only + saveDb bisa menimpa absensi/izin di SQLite
      let relational = await loadOfflineDbSnapshot();
      if (!relational) {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          await importLegacyLocalStorageJson(legacy);
          localStorage.removeItem(STORAGE_KEY);
          relational = await loadOfflineDbSnapshot();
        }
      }
      if (relational) {
        applyRelationalSnapshot(normalizeDb(relational as Record<string, unknown>));
        return;
      }
      db = normalizeDb(getInitialDbSnapshot());
      afterDbHydrated();
      await saveOfflineDbSnapshot(snapshotFromMemory());
      return;
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      applyLoadedSnapshot(raw);
      return;
    }
    db = normalizeDb(getInitialDbSnapshot());
    afterDbHydrated();
    void saveDb();
  } catch (err) {
    console.error('Failed to load offline DB:', err);
    if (shouldPersistToSqlite()) {
      try {
        db = normalizeDb(getInitialDbSnapshot());
        afterDbHydrated();
        await saveOfflineDbSnapshot(snapshotFromMemory());
      } catch (recoverErr) {
        console.error('Failed to recover offline DB from seed:', recoverErr);
      }
    }
  } finally {
    dbLoaded = true;
  }
};

/** Asrama aktif sesuai sesi login; null = lihat semua (super admin tanpa pilihan). */
function activeAsramaId(): string | null {
  const user = getSessionUser();
  if (!user) return defaultAsramaId(db.settings);
  if (user.activeAsramaId) return user.activeAsramaId;
  if (user.role === 'pengawas') return user.asramaIds[0] ?? null;
  // super_admin & bendahara: semua asrama kecuali dipilih di switcher
  return null;
}

/** Baris lama tanpa asrama_id diberi asrama pertama (migrasi multi-asrama). */
function assignDefaultAsramaToRows(): void {
  const fallback = defaultAsramaId(db.settings);
  if (!fallback) return;
  for (const s of db.santri) if (!s.asrama_id) s.asrama_id = fallback;
  for (const k of db.kamar) if (!k.asrama_id) k.asrama_id = fallback;
}

function santriInScope(): Record<string, unknown>[] {
  const aid = activeAsramaId();
  if (!aid) return db.santri;
  return db.santri.filter((s) => !s.asrama_id || s.asrama_id === aid);
}

function kamarInScope(): Record<string, unknown>[] {
  const aid = activeAsramaId();
  if (!aid) return db.kamar;
  return db.kamar.filter((k) => !k.asrama_id || k.asrama_id === aid);
}

function scopedSantriIds(): Set<string> {
  return new Set(santriInScope().map((s) => String(s.id)));
}

function scopedKamarIds(): Set<string> {
  return new Set(kamarInScope().map((k) => String(k.id)));
}

function isSuperAdminSession(): boolean {
  const u = getSessionUser();
  return !u || u.role === 'super_admin';
}

export function ensureClientApiDbLoaded(): Promise<void> {
  if (dbLoaded) return Promise.resolve();
  if (!dbLoadPromise) {
    dbLoadPromise = loadDbAsync();
  }
  return dbLoadPromise;
}

/** Terapkan settings dari Turso Cloud ke RAM + persist lokal. */
export async function applySettingsFromCloud(settings: AppSettings): Promise<void> {
  await ensureClientApiDbLoaded();
  db.settings = mergeAppSettings({ ...settings, setupSelesai: true });
  markOnboardingComplete();
  await saveDb(SQL_SCOPE.settings);
}

/** Snapshot penuh untuk sync lintas platform (Electron / Web / Android). */
export async function exportSyncSnapshot(): Promise<{
  snapshot: ReturnType<typeof snapshotFromMemory>;
  updatedAt: string;
}> {
  await ensureClientApiDbLoaded();
  await flushClientApiPersist();
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    const full = await loadOfflineDbSnapshot();
    if (full) {
      return { snapshot: full, updatedAt: getDataUpdatedAt() };
    }
  }
  return { snapshot: snapshotFromMemory(), updatedAt: getDataUpdatedAt() };
}

/** Terapkan snapshot cloud ke lokal (replace). */
export async function importSyncSnapshot(
  snapshot: Record<string, unknown>,
  remoteUpdatedAt: string
): Promise<void> {
  await ensureClientApiDbLoaded();
  const normalized = normalizeDb(snapshot);
  if (shouldPersistToSqlite()) {
    await replaceOfflineDbSnapshot(normalized);
    applyRelationalSnapshot(normalized);
  } else {
    db = normalized;
    afterDbHydrated();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
  try {
    localStorage.setItem(DATA_UPDATED_AT_KEY, remoteUpdatedAt);
  } catch {
    /* ignore */
  }
  markOnboardingComplete();
}

/** Muat ulang RAM dari SQLite / localStorage setelah impor/sync (FULL — jangan core-only). */
export async function reloadClientApiFromStorage(): Promise<void> {
  await flushClientApiPersist();
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    const relational = await loadOfflineDbSnapshot();
    if (relational) {
      applyRelationalSnapshot(normalizeDb(relational as Record<string, unknown>));
      afterDbHydrated();
    }
    return;
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    applyLoadedSnapshot(raw);
    return;
  }
  db = normalizeDb(getInitialDbSnapshot());
  afterDbHydrated();
}

let pauseFlushRegistered = false;

function registerNativePauseFlush(): void {
  if (pauseFlushRegistered || typeof document === 'undefined') return;
  if (!shouldUseClientApiStore()) return;
  pauseFlushRegistered = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushClientApiPersist();
  });
}

function clearLegacyWebStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function persistFullSqliteSnapshot(): Promise<void> {
  clearLegacyWebStorage();
  await replaceOfflineDbSnapshot(snapshotFromMemory());
}

/** Panggil saat startup APK agar tidak race dengan hydrate pertama. */
export function initClientApiStore(): Promise<void> {
  if (!shouldUseClientApiStore()) return Promise.resolve();
  return ensureClientApiDbLoaded().then(() => {
    registerNativePauseFlush();
  });
}

type PersistOpts = { fullHeavyFlush?: boolean };

const persistDbAsync = async (tables?: SqlEntity[], opts?: PersistOpts) => {
  bumpDataUpdatedAt();
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    await commitSqlTables(snapshotFromMemory(), tables ?? SQL_ENTITIES_ALL, opts);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

/** Antre push Turso tanpa memblokir respons API (hindari loading lama di form). */
function queueTursoPush(): void {
  const url = (import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined)?.trim();
  const token = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string | undefined)?.trim();
  if (!url || !token) return;
  void import('@/lib/sync/turso-sync')
    .then(({ scheduleSyncSoon }) => scheduleSyncSoon(350))
    .catch(() => undefined);
}

const saveDb = (tables?: SqlEntity[], opts?: PersistOpts): Promise<void> => {
  const task = persistChain.then(async () => {
    await persistDbAsync(tables, opts);
    // Full online: lokal dulu (UI cepat), lalu push cloud di background.
    queueTursoPush();
  });
  persistChain = task.catch((err) => {
    console.error('Failed to save offline DB:', err);
  });
  return task;
};

async function persistSantriRow(row: Record<string, unknown>) {
  if (!shouldPersistToSqlite()) return;
  await sqlUpsertSantriRow(row, db.kamar);
}

async function persistRiwayatAppended(sinceIndex: number) {
  if (!shouldPersistToSqlite()) return;
  const slice = db.riwayat_kamar.slice(sinceIndex);
  for (const r of slice) {
    await sqlInsertRiwayatKamar(r, db.kamar);
  }
}

function normalizeSantriId(raw: unknown): string {
  try {
    return decodeURIComponent(String(raw ?? '').trim());
  } catch {
    return String(raw ?? '').trim();
  }
}

/** Cari santri di RAM API lalu SQLite; sinkronkan ke RAM jika ada di DB. */
async function resolveSantriRecord(rawId: unknown): Promise<Record<string, unknown> | null> {
  const id = normalizeSantriId(rawId);
  if (!id) return null;

  const inMem = db.santri.find((s) => String(s.id) === id);
  if (inMem) return inMem;

  if (shouldPersistToSqlite()) {
    const row = await sqlGetSantriById(id);
    if (row) {
      db.santri.push(row);
      return row;
    }
  }

  return null;
}

async function ensureSantriInMemory(id: string): Promise<Record<string, unknown> | null> {
  return resolveSantriRecord(id);
}

async function enrichWithSantriFields<T extends Record<string, unknown>>(
  row: T
): Promise<T & { santri_nama: string; santri_kamar: string }> {
  const sid = row.santri_id ? normalizeSantriId(row.santri_id) : '';
  const santri = sid ? await resolveSantriRecord(sid) : null;
  return {
    ...row,
    santri_nama: santri?.nama ? String(santri.nama) : '',
    santri_kamar: santri?.kamar ? String(santri.kamar) : '-',
  };
}

/** Pastikan baris santri ada di SQLite sebelum absensi / izin / BK. */
async function ensureSantriForChildWrite(santriId: unknown): Promise<ApiResult | null> {
  const id = normalizeSantriId(santriId);
  if (!id) return { status: 400, body: { error: 'Pilih santri terlebih dahulu.' } };
  if (!scopedSantriIds().has(id)) {
    return { status: 403, body: { error: 'Santri berada di luar asrama Anda.' } };
  }

  let row = await resolveSantriRecord(id);
  if (!row && shouldPersistToSqlite()) {
    await flushClientApiPersist();
    row = await resolveSantriRecord(id);
  }
  if (!row) {
    return {
      status: 400,
      body: { error: 'Santri tidak valid. Pilih lagi dari daftar santri.' },
    };
  }

  if (shouldPersistToSqlite()) {
    await flushClientApiPersist();
    await persistSantriRow(row);
    try {
      await requireSantriInDatabase(id);
    } catch (e) {
      if (e instanceof SqlForeignKeyError) {
        return { status: 409, body: { error: e.message } };
      }
      throw e;
    }
  }

  return null;
}

/** Pastikan antrian simpan selesai (impor backup, dll.). */
export function flushClientApiPersist(): Promise<void> {
  return persistChain;
}

const normalizeKamarName = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const clearKetuaIfSantriLeaves = (kamarNama: string, santriNama: string) => {
  const kamar = db.kamar.find((k) => k.nama === kamarNama) as
    | { ketua?: string; ketua_santri_id?: string }
    | undefined;
  if (kamar && kamar.ketua === santriNama) {
    kamar.ketua = '';
    delete kamar.ketua_santri_id;
  }
};

type KamarAssignmentResult =
  | null
  | { promotedKetua: { nama: string; kamarNama: string } }
  | { error: string; status: number };

const applySantriKamarAssignment = async (
  santri: { id: string; nama?: string; kamar?: string; masuk_kamar_sejak?: string },
  nextKamarRaw: unknown,
  opts?: { fromKamarPage?: boolean; moveKamar?: boolean; autoPromoteKetuaKamarLama?: boolean }
): Promise<KamarAssignmentResult> => {
  const nextKamar = normalizeKamarName(nextKamarRaw);
  const prevKamar = normalizeKamarName(santri.kamar);

  if (nextKamar === prevKamar) return null;

  if (opts?.fromKamarPage && prevKamar && nextKamar && !opts?.moveKamar) {
    return {
      error: `Santri sudah terdaftar di ${prevKamar}. Satu santri hanya boleh satu kamar.`,
      status: 400,
    };
  }

  const prevKamarRecord = prevKamar
    ? db.kamar.find((k) => k.nama === prevKamar) as
        | { id: string; nama: string; ketua?: string; ketua_santri_id?: string }
        | undefined
    : undefined;
  const wasKetua = Boolean(prevKamar && santri.nama && prevKamarRecord?.ketua === santri.nama);

  if (prevKamar && santri.nama) {
    clearKetuaIfSantriLeaves(prevKamar, santri.nama);
  }

  let promotedKetua: { nama: string; kamarNama: string } | undefined;

  if (!nextKamar) {
    santri.kamar = '';
    delete santri.masuk_kamar_sejak;
    if (!Array.isArray(db.riwayat_kamar)) db.riwayat_kamar = [];
    logSantriKamarAssignmentChange(
      db.riwayat_kamar,
      newId,
      santri.id,
      prevKamar,
      '',
      (nama) => db.kamar.find((k) => k.nama === nama)?.id as string | undefined
    );
    return promotedKetua ? { promotedKetua } : null;
  }

  const kamar = db.kamar.find((k) => k.nama === nextKamar);
  if (!kamar) {
    return { error: 'Kamar tidak ditemukan', status: 404 };
  }

  const penghuniCount = shouldPersistToSqlite()
    ? await sqlCountPenghuniKamar(nextKamar, santri.id)
    : db.santri.filter(
        (s) => s.id !== santri.id && normalizeKamarName(s.kamar) === nextKamar
      ).length;
  const kapasitas = Number(kamar.kapasitas) || 4;
  if (penghuniCount >= kapasitas) {
    return { error: 'Kamar sudah penuh', status: 400 };
  }

  santri.kamar = nextKamar;
  santri.masuk_kamar_sejak = new Date().toISOString();
  if (!Array.isArray(db.riwayat_kamar)) db.riwayat_kamar = [];
  logSantriKamarAssignmentChange(
    db.riwayat_kamar,
    newId,
    santri.id,
    prevKamar,
    nextKamar,
    (nama) => db.kamar.find((k) => k.nama === nama)?.id as string | undefined
  );

  if (wasKetua && opts?.autoPromoteKetuaKamarLama && prevKamar && prevKamarRecord) {
    const nextLeader = shouldPersistToSqlite()
      ? await sqlPickLongestInKamar(prevKamar, santri.id)
      : pickSantriLongestInKamar(
          db.santri as { id: string; nama?: string; kamar?: string; masuk_kamar_sejak?: string }[],
          prevKamar,
          santri.id
        );
    if (nextLeader) {
      const leaderNama = String(nextLeader.nama ?? '').trim();
      if (leaderNama) {
        prevKamarRecord.ketua = leaderNama;
        prevKamarRecord.ketua_santri_id = String(nextLeader.id);
        recordSantriKamarRiwayat(db.riwayat_kamar, newId, {
          santri_id: nextLeader.id,
          kamar_nama: prevKamar,
          kamar_id: String(prevKamarRecord.id),
          tipe: 'ketua',
        });
        promotedKetua = { nama: leaderNama, kamarNama: prevKamar };
      }
    }
  }

  return promotedKetua ? { promotedKetua } : null;
};

type ApiResult = { status: number; body: unknown };

function sqliteErrorToApiResult(err: unknown): ApiResult {
  const message = mapSqliteErrorToUserMessage(err);
  const status =
    err instanceof SqlForeignKeyError || /FOREIGN KEY|foreign key/i.test(message)
      ? 409
      : /database is locked|cannot perform/i.test(message)
        ? 503
        : 500;
  if (status === 500) console.error('API / SQLite:', err);
  return { status, body: { error: message } };
}

async function dispatchApi(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown> | null
): Promise<ApiResult> {
  try {
    return await dispatchApiCore(method, pathname, searchParams, body);
  } catch (err) {
    return sqliteErrorToApiResult(err);
  }
}

async function dispatchApiCore(
  method: string,
  pathname: string,
  searchParams: URLSearchParams,
  body: Record<string, unknown> | null
): Promise<ApiResult> {
  if (shouldUseClientApiStore()) {
    await ensureClientApiDbLoaded();
  }
  const m = method.toUpperCase();

  if (m === 'GET' && pathname.startsWith('/api/wilayah')) {
    const index = getWilayahIndexSync();
    if (!index) {
      return { status: 500, body: { error: 'Indeks wilayah tidak tersedia' } };
    }
    const wilayahResult = await handleWilayahApi(pathname, searchParams, index);
    if (wilayahResult) return wilayahResult;
  }

  if (pathname.startsWith('/api/pembayaran')) {
    const pembayaranResult = await handlePembayaranApi(m, pathname, searchParams, body, {
      listSantri: () => santriInScope(),
    });
    if (pembayaranResult) return pembayaranResult;
  }

  if (pathname === '/api/auth/login' && m === 'POST' && body) {
    const password = String(body.password ?? '');
    return handleAuthLogin(db.settings, password);
  }

  if (pathname === '/api/auth/change-password' && m === 'POST' && body) {
    const result = handleAuthChangePassword(
      db.settings,
      String(body.currentPassword ?? ''),
      String(body.newPassword ?? '')
    );
    if (result.status === 200) await saveDb(SQL_SCOPE.settings);
    return result;
  }

  if (pathname === '/api/auth/recovery-questions' && m === 'GET') {
    return handleAuthRecoveryQuestions(db.settings);
  }

  if (pathname === '/api/auth/reset-password' && m === 'POST' && body) {
    const answers = (body.answers as { questionId: SecurityQuestionId; answer: string }[]) ?? [];
    const result = handleAuthResetPassword(db.settings, answers);
    if (result.status === 200) await saveDb(SQL_SCOPE.settings);
    return result;
  }

  if (pathname === '/api/auth/security-questions' && m === 'PUT' && body) {
    const questions =
      (body.questions as { questionId: SecurityQuestionId; answer: string }[]) ?? [];
    const result = handleAuthSecurityQuestions(
      db.settings,
      String(body.currentPassword ?? ''),
      questions
    );
    if (result.status === 200) await saveDb(SQL_SCOPE.settings);
    return result;
  }

  if (pathname === '/api/auth/accounts' && m === 'GET') {
    return handleAuthAccounts(db.settings);
  }

  if (pathname === '/api/auth/login-account' && m === 'POST' && body) {
    return handleAuthLoginAccount(
      db.settings,
      String(body.id ?? ''),
      String(body.pin ?? '')
    );
  }

  if (pathname === '/api/auth/change-pin' && m === 'POST' && body) {
    const result = handlePenggunaChangePin(
      db.settings,
      String(body.id ?? ''),
      String(body.currentPin ?? ''),
      String(body.newPin ?? '')
    );
    if (result.status === 200) await saveDb(SQL_SCOPE.settings);
    return result;
  }

  if (pathname === '/api/asrama') {
    if (m === 'GET') return handleAsramaList(db.settings);
    if (m === 'POST' && body) {
      if (!isSuperAdminSession()) return { status: 403, body: { error: 'Hanya super admin' } };
      const result = handleAsramaCreate(db.settings, body, newId);
      if (result.status === 200) await saveDb(SQL_SCOPE.settings);
      return result;
    }
  }

  const asramaIdMatch = pathname.match(/^\/api\/asrama\/([^/]+)$/);
  if (asramaIdMatch) {
    if (!isSuperAdminSession()) return { status: 403, body: { error: 'Hanya super admin' } };
    const id = asramaIdMatch[1];
    if (m === 'PUT' && body) {
      const result = handleAsramaUpdate(db.settings, id, body);
      if (result.status === 200) await saveDb(SQL_SCOPE.settings);
      return result;
    }
    if (m === 'DELETE') {
      const inUse =
        db.santri.some((s) => s.asrama_id === id) || db.kamar.some((k) => k.asrama_id === id);
      const result = handleAsramaDelete(db.settings, id, inUse);
      if (result.status === 200) await saveDb(SQL_SCOPE.settings);
      return result;
    }
  }

  if (pathname === '/api/pengguna') {
    if (!isSuperAdminSession()) return { status: 403, body: { error: 'Hanya super admin' } };
    if (m === 'GET') return handlePenggunaList(db.settings);
    if (m === 'POST' && body) {
      const result = handlePenggunaCreate(db.settings, body, newId);
      if (result.status === 200) await saveDb(SQL_SCOPE.settings);
      return result;
    }
  }

  const penggunaResetMatch = pathname.match(/^\/api\/pengguna\/([^/]+)\/reset-pin$/);
  if (penggunaResetMatch && m === 'POST' && body) {
    if (!isSuperAdminSession()) return { status: 403, body: { error: 'Hanya super admin' } };
    const result = handlePenggunaResetPin(
      db.settings,
      penggunaResetMatch[1],
      String(body.pin ?? '')
    );
    if (result.status === 200) await saveDb(SQL_SCOPE.settings);
    return result;
  }

  const penggunaIdMatch = pathname.match(/^\/api\/pengguna\/([^/]+)$/);
  if (penggunaIdMatch) {
    if (!isSuperAdminSession()) return { status: 403, body: { error: 'Hanya super admin' } };
    const id = penggunaIdMatch[1];
    if (m === 'PUT' && body) {
      const result = handlePenggunaUpdate(db.settings, id, body);
      if (result.status === 200) await saveDb(SQL_SCOPE.settings);
      return result;
    }
    if (m === 'DELETE') {
      const result = handlePenggunaDelete(db.settings, id);
      if (result.status === 200) await saveDb(SQL_SCOPE.settings);
      return result;
    }
  }

  if (pathname === '/api/onboarding/complete' && m === 'POST' && body) {
    const result = handleOnboardingComplete(
      { settings: db.settings, kelas: db.kelas },
      body as OnboardingCompleteBody,
      () => crypto.randomUUID()
    );
    if (result.status === 200) {
      await saveDb([...SQL_SCOPE.settings, ...SQL_SCOPE.kelas]);
      void import('@/lib/sync/cloud-bootstrap')
        .then(({ isTursoConfigured, pushSettingsToTurso }) => {
          if (isTursoConfigured()) return pushSettingsToTurso(db.settings);
        })
        .catch((err) => console.warn('Push settings ke Turso gagal:', err));
    }
    return result;
  }

  if (pathname === '/api/settings') {
    if (m === 'GET') return { status: 200, body: mergeAppSettings(db.settings) };
    if (m === 'PUT') {
      db.settings = mergeAppSettings({ ...db.settings, ...(body ?? {}) });
      await saveDb(SQL_SCOPE.settings);
      void import('@/lib/sync/cloud-bootstrap')
        .then(({ isTursoConfigured, pushSettingsToTurso }) => {
          if (isTursoConfigured()) return pushSettingsToTurso(db.settings);
        })
        .catch((err) => console.warn('Push settings ke Turso gagal:', err));
      return { status: 200, body: db.settings };
    }
  }

  if (pathname === '/api/dashboard' && m === 'GET') {
    const sIds = scopedSantriIds();
    const totalSantri = shouldPersistToSqlite()
      ? await sqlCountSantri(activeAsramaId() ?? undefined)
      : sIds.size;
    const sedangIzin = shouldPersistToSqlite()
      ? (await sqlListIzinEnriched()).filter(
          (i) => i.status_kembali === 'Belum' && sIds.has(String(i.santri_id ?? ''))
        ).length
      : db.izin.filter(
          (i) => i.status_kembali === 'Belum' && sIds.has(String(i.santri_id ?? ''))
        ).length;
    let hadirTerakhir = 0;
    let kegiatanTerakhir = 'Belum ada absensi';
    if (shouldPersistToSqlite()) {
      const absStats = await sqlDashboardAbsensiStats();
      hadirTerakhir = absStats.hadirTerakhir;
      kegiatanTerakhir = absStats.kegiatanTerakhir;
    } else if (db.absensi.length > 0) {
      const sorted = [...db.absensi].sort(
        (a, b) => new Date(String(b.tanggal)).getTime() - new Date(String(a.tanggal)).getTime()
      );
      kegiatanTerakhir = String(sorted[0].kegiatan);
      hadirTerakhir = db.absensi.filter(
        (a) => a.kegiatan === kegiatanTerakhir && a.status === 'Hadir'
      ).length;
    }
    const totalKapasitas = kamarInScope().reduce(
      (acc, k) => acc + (Number(k.kapasitas) || 0),
      0
    );
    const totalTerisi = totalSantri;
    return {
      status: 200,
      body: {
        totalSantri,
        sedangIzin,
        hadirTerakhir,
        kegiatanTerakhir,
        belumKembali: sedangIzin,
        totalKapasitas,
        totalTerisi,
        sisaRanjang: Math.max(0, totalKapasitas - totalTerisi),
      },
    };
  }

  const santriIdOnlyGet = pathname.match(/^\/api\/santri\/([^/]+)$/);
  if (santriIdOnlyGet && m === 'GET') {
    const id = normalizeSantriId(santriIdOnlyGet[1]);
    if (!scopedSantriIds().has(id)) {
      return { status: 404, body: { error: 'Data santri tidak ada' } };
    }
    if (shouldPersistToSqlite()) {
      const row = await sqlGetSantriById(id);
      if (!row) return { status: 404, body: { error: 'Data santri tidak ada' } };
      const idx = db.santri.findIndex((s) => String(s.id) === id);
      if (idx >= 0) db.santri[idx] = row;
      else db.santri.push(row);
      return { status: 200, body: row };
    }
    const row = await resolveSantriRecord(id);
    if (!row) return { status: 404, body: { error: 'Data santri tidak ada' } };
    return { status: 200, body: row };
  }

  if (pathname === '/api/santri') {
    if (m === 'GET') {
      const { page, limit, q, kamar, summary } = parsePageParams(searchParams);
      if (summary) {
        if (shouldPersistToSqlite()) {
          const items = await sqlListSantriSummary(activeAsramaId() ?? undefined);
          return { status: 200, body: items };
        }
        return {
          status: 200,
          body: santriInScope().map((s) => ({
            id: s.id,
            nama: s.nama,
            kelas: s.kelas,
            kamar: s.kamar,
            nomor_wali: s.nomor_wali ?? '',
            jenis_kelamin: s.jenis_kelamin ?? '',
            include_wa: s.include_wa === false || s.include_wa === 0 ? false : true,
            asal_provinsi_code: s.asal_provinsi_code,
            asal_provinsi_nama: s.asal_provinsi_nama,
            asal_kota_code: s.asal_kota_code,
            asal_kota_nama: s.asal_kota_nama,
            asal_kecamatan_code: s.asal_kecamatan_code,
            asal_kecamatan_nama: s.asal_kecamatan_nama,
            asal_desa_code: s.asal_desa_code,
            asal_desa_nama: s.asal_desa_nama,
            jumlah_pelanggaran: s.jumlah_pelanggaran,
            masuk_kamar_sejak: s.masuk_kamar_sejak,
          })),
        };
      }
      const wantsPage =
        searchParams.has('page') ||
        searchParams.has('limit') ||
        searchParams.has('q') ||
        searchParams.has('kamar');
      if (wantsPage || shouldPersistToSqlite()) {
        if (shouldPersistToSqlite()) {
          const paged = await sqlQuerySantriPage({
            page,
            limit,
            q,
            kamar: kamar === 'Semua' ? '' : kamar,
            asramaId: activeAsramaId() ?? undefined,
          });
          return { status: 200, body: paged };
        }
        const filtered = santriInScope().filter((s) => {
          const matchQ =
            !q ||
            String(s.nama ?? '').toLowerCase().includes(q.toLowerCase()) ||
            String(s.kelas ?? '').toLowerCase().includes(q.toLowerCase()) ||
            String(s.kamar ?? '').toLowerCase().includes(q.toLowerCase()) ||
            String(s.nomor_wali ?? '').includes(q);
          const matchKamar = !kamar || kamar === 'Semua' || s.kamar === kamar;
          return matchQ && matchKamar;
        });
        return { status: 200, body: paginateInMemory(filtered, page, limit) };
      }
      return { status: 200, body: santriInScope() };
    }
    if (m === 'POST' && body) {
      const raw = omitPoin(body);
      const { kamar: _kamar, ...rest } = raw as { kamar?: string };
      const now = new Date().toISOString();
      const newSantri = {
        id: newId(),
        jumlah_pelanggaran: 0,
        kamar: '',
        asrama_id: activeAsramaId() ?? defaultAsramaId(db.settings),
        created_at: now,
        updated_at: now,
        ...rest,
      };
      const kamarResult = await applySantriKamarAssignment(newSantri, _kamar);
      if (kamarResult && 'error' in kamarResult) {
        return { status: kamarResult.status, body: { error: kamarResult.error } };
      }
      const riBefore = db.riwayat_kamar.length;
      db.santri.push(newSantri);
      if (shouldPersistToSqlite()) {
        await saveDb(['kamar']);
        await persistSantriRow(newSantri);
        await persistRiwayatAppended(riBefore);
      } else {
        await saveDb(SQL_SCOPE.santri);
      }
      return { status: 200, body: newSantri };
    }
  }

  if (pathname === '/api/santri/kenaikan-kelas' && m === 'POST' && body) {
    const ids = Array.isArray(body.santri_ids)
      ? (body.santri_ids as unknown[]).map((v) => String(v))
      : [];
    const aksi =
      body.aksi === 'lulus' ? 'lulus' : body.aksi === 'keluar' ? 'keluar' : 'naik';
    const targetKelas = typeof body.kelas === 'string' ? body.kelas.trim() : '';
    if (!ids.length) {
      return { status: 400, body: { error: 'Tidak ada santri yang dipilih.' } };
    }
    if (aksi === 'naik' && !targetKelas) {
      return { status: 400, body: { error: 'Pilih kelas tujuan terlebih dahulu.' } };
    }
    const statusKelas =
      aksi === 'lulus'
        ? { nama: 'Alumni', tingkat: 'ALUMNI' }
        : aksi === 'keluar'
          ? { nama: 'Keluar', tingkat: 'KELUAR' }
          : null;
    if (statusKelas && !db.kelas.some((k) => k.nama === statusKelas.nama)) {
      db.kelas.push({ id: newId(), ...statusKelas });
      await saveDb(SQL_SCOPE.kelas);
    }
    const scoped = scopedSantriIds();
    const riBefore = db.riwayat_kamar.length;
    const now = new Date().toISOString();
    let updated = 0;
    let skipped = 0;
    for (const id of ids) {
      if (!scoped.has(id)) {
        skipped++;
        continue;
      }
      const santri = await ensureSantriInMemory(id);
      if (!santri) {
        skipped++;
        continue;
      }
      if (statusKelas) {
        const kamarResult = await applySantriKamarAssignment(
          santri as { id: string; nama?: string; kamar?: string; masuk_kamar_sejak?: string },
          '',
          { moveKamar: true }
        );
        if (kamarResult && 'error' in kamarResult) {
          skipped++;
          continue;
        }
        santri.kelas = statusKelas.nama;
      } else {
        santri.kelas = targetKelas;
      }
      santri.updated_at = now;
      if (shouldPersistToSqlite()) await persistSantriRow(santri);
      updated++;
    }
    if (shouldPersistToSqlite()) {
      await saveDb(['kamar']);
      await persistRiwayatAppended(riBefore);
    } else {
      await saveDb(SQL_SCOPE.santri);
    }
    return { status: 200, body: { updated, skipped } };
  }

  const santriRiwayatKamarMatch = pathname.match(/^\/api\/santri\/([^/]+)\/riwayat-kamar$/);
  if (santriRiwayatKamarMatch && m === 'GET') {
    if (shouldPersistToSqlite()) {
      const sid = santriRiwayatKamarMatch[1];
      const row = await sqlGetSantriById(sid);
      if (!row) return { status: 404, body: { error: 'Santri tidak ditemukan' } };
      const riwayat = await sqlListRiwayatKamarForSantri(sid);
      const payload = buildSantriKamarRiwayatResponse(sid, {
        santri: [row as { id: string; nama?: string; kelas?: string; kamar?: string; masuk_kamar_sejak?: string }],
        kamar: db.kamar as { id: string; nama: string; kapasitas?: number; ketua?: string }[],
        riwayat_kamar: riwayat,
      });
      if (!payload) return { status: 404, body: { error: 'Santri tidak ditemukan' } };
      return { status: 200, body: payload };
    }
    const payload = buildSantriKamarRiwayatResponse(santriRiwayatKamarMatch[1], {
      santri: db.santri as {
        id: string;
        nama?: string;
        kelas?: string;
        kamar?: string;
        masuk_kamar_sejak?: string;
      }[],
      kamar: db.kamar as { id: string; nama: string; kapasitas?: number; ketua?: string }[],
      riwayat_kamar: db.riwayat_kamar,
    });
    if (!payload) return { status: 404, body: { error: 'Santri tidak ditemukan' } };
    return { status: 200, body: payload };
  }

  const santriResetMatch = pathname.match(/^\/api\/santri\/([^/]+)\/reset-pelanggaran$/);
  if (santriResetMatch && m === 'POST') {
    const santri = await ensureSantriInMemory(santriResetMatch[1]);
    if (!santri) return { status: 404, body: { error: 'Santri tidak ditemukan' } };
    santri.jumlah_pelanggaran = 0;
    if (shouldPersistToSqlite()) {
      await sqlSetSantriPelanggaran(santriResetMatch[1], 0);
    } else {
      await saveDb(SQL_SCOPE.santri);
    }
    return { status: 200, body: santri };
  }

  const santriIdMatch = pathname.match(/^\/api\/santri\/([^/]+)$/);
  if (santriIdMatch) {
    const id = santriIdMatch[1];
    if (m === 'PUT' && body) {
      let index = db.santri.findIndex((s) => s.id === id);
      if (index === -1) {
        const loaded = await ensureSantriInMemory(id);
        if (!loaded) return { status: 404, body: { error: 'Santri tidak ditemukan' } };
        index = db.santri.findIndex((s) => s.id === id);
      }
      const riBefore = db.riwayat_kamar.length;
      const payload = omitPoin(body);
      const santri = db.santri[index] as { id: string; nama?: string; kamar?: string };
      const fromKamarPage = body.from_kamar_page === true;
      const moveKamar = body.move_kamar === true;
      const autoPromoteKetuaKamarLama = body.auto_promote_ketua_kamar_lama === true;
      let promotedKetua: { nama: string; kamarNama: string } | undefined;
      if ('kamar' in payload) {
        const kamarResult = await applySantriKamarAssignment(santri, payload.kamar, {
          fromKamarPage,
          moveKamar,
          autoPromoteKetuaKamarLama,
        });
        if (kamarResult && 'error' in kamarResult) {
          return { status: kamarResult.status, body: { error: kamarResult.error } };
        }
        if (kamarResult && 'promotedKetua' in kamarResult) {
          promotedKetua = kamarResult.promotedKetua;
        }
        const {
          kamar: _k,
          from_kamar_page: _fk,
          move_kamar: _mk,
          auto_promote_ketua_kamar_lama: _ap,
          ...rest
        } = payload as Record<string, unknown>;
        db.santri[index] = { ...santri, ...rest };
      } else {
        const {
          from_kamar_page: _fk,
          move_kamar: _mk,
          auto_promote_ketua_kamar_lama: _ap,
          ...rest
        } = payload as Record<string, unknown>;
        db.santri[index] = { ...santri, ...rest };
      }
      if (shouldPersistToSqlite()) {
        await persistSantriRow(db.santri[index]);
        await saveDb(['kamar']);
        await persistRiwayatAppended(riBefore);
      } else {
        await saveDb(SQL_SCOPE.santri);
      }
      const responseBody = { ...db.santri[index] } as Record<string, unknown>;
      if (promotedKetua) {
        responseBody.promoted_ketua_nama = promotedKetua.nama;
        responseBody.promoted_ketua_kamar = promotedKetua.kamarNama;
      }
      return { status: 200, body: responseBody };
    }
    if (m === 'DELETE') {
      const normalizedId = normalizeSantriId(id);
      let index = db.santri.findIndex((s) => String(s.id) === normalizedId);
      let rowForPurge: { id: string; nama?: string; kamar?: string } | null =
        index >= 0 ? (db.santri[index] as { id: string; nama?: string; kamar?: string }) : null;

      if (index === -1 && shouldPersistToSqlite()) {
        const exists = await sqlGetSantriById(normalizedId);
        if (!exists) return { status: 404, body: { error: 'Santri tidak ditemukan' } };
        rowForPurge = exists as { id: string; nama?: string; kamar?: string };
      } else if (index === -1) {
        return { status: 404, body: { error: 'Santri tidak ditemukan' } };
      }

      purgeSantriRelatedData(db, normalizedId, rowForPurge);
      await purgePembayaranForSantri(normalizedId);
      if (shouldPersistToSqlite()) {
        await sqlDeleteSantriCascade(normalizedId);
        db.penjadwalan = (await sqlListPenjadwalanRaw()) as Record<string, unknown>[];
        await saveDb(['kamar']);
      } else {
        await saveDb();
      }
      return { status: 200, body: { success: true } };
    }
  }

  if (pathname === '/api/kamar' && m === 'GET') {
    const aid = activeAsramaId();
    if (shouldPersistToSqlite()) {
      const result = (await sqlListKamarWithPenghuni()).filter(
        (k) => !aid || !k.asrama_id || k.asrama_id === aid
      );
      db.kamar = result.map((row) => {
        const { terisi: _t, santriList: _s, ...base } = row;
        return base;
      });
      return { status: 200, body: result };
    }
    const result = kamarInScope().map((k) => {
      const penghuni = santriInScope().filter((s) => s.kamar === k.nama);
      return {
        ...k,
        terisi: penghuni.length,
        santriList: penghuni.map((s) => ({
          id: s.id,
          nama: s.nama,
          kelas: s.kelas,
          masuk_kamar_sejak: s.masuk_kamar_sejak,
        })),
      };
    });
    return { status: 200, body: result };
  }

  if (pathname === '/api/kamar' && m === 'POST' && body) {
    const newKamar = {
      id: newId(),
      asrama_id: activeAsramaId() ?? defaultAsramaId(db.settings),
      ...body,
      kapasitas: Number(body.kapasitas) || 4,
      fasilitas: Array.isArray(body.fasilitas) ? body.fasilitas : [],
    };
    db.kamar.push(newKamar);
    if (shouldPersistToSqlite()) {
      try {
        await sqlUpsertKamarRow(newKamar);
        queueTursoPush();
      } catch (err) {
        db.kamar = db.kamar.filter((k) => k.id !== newKamar.id);
        throw err;
      }
    } else {
      await saveDb(['kamar']);
    }
    return { status: 200, body: newKamar };
  }

  const kamarKetuaMatch = pathname.match(/^\/api\/kamar\/([^/]+)\/ketua$/);
  if (kamarKetuaMatch && m === 'PUT' && body) {
    const kamar = db.kamar.find((k) => k.id === kamarKetuaMatch[1]);
    if (!kamar) return { status: 404, body: { error: 'Kamar tidak ditemukan' } };
    const santri = await ensureSantriInMemory(String(body.santri_id));
    if (!santri) return { status: 404, body: { error: 'Santri tidak ditemukan' } };
    if (normalizeKamarName(santri.kamar) !== kamar.nama) {
      return { status: 400, body: { error: 'Santri harus berada di kamar ini untuk dijadikan ketua' } };
    }
    kamar.ketua = santri.nama;
    (kamar as { ketua_santri_id?: string }).ketua_santri_id = String(santri.id);
    if (!Array.isArray(db.riwayat_kamar)) db.riwayat_kamar = [];
    const riBefore = db.riwayat_kamar.length;
    recordSantriKamarRiwayat(db.riwayat_kamar, newId, {
      santri_id: String(santri.id),
      kamar_nama: String(kamar.nama),
      kamar_id: String(kamar.id),
      tipe: 'ketua',
    });
    if (shouldPersistToSqlite()) {
      await persistSantriRow(santri);
      await sqlUpsertKamarRow(kamar as Record<string, unknown>);
      await persistRiwayatAppended(riBefore);
    } else {
      await saveDb(SQL_SCOPE.kamar);
    }
    return { status: 200, body: kamar };
  }

  const kamarFasilitasItemMatch = pathname.match(/^\/api\/kamar\/([^/]+)\/fasilitas\/([^/]+)$/);
  if (kamarFasilitasItemMatch) {
    const kamarId = kamarFasilitasItemMatch[1];
    const fasilitasId = kamarFasilitasItemMatch[2];
    const kamar = db.kamar.find((k) => k.id === kamarId) as Record<string, unknown> | undefined;
    if (!kamar) return { status: 404, body: { error: 'Kamar tidak ditemukan' } };
    const list = Array.isArray(kamar.fasilitas)
      ? (kamar.fasilitas as Record<string, unknown>[])
      : [];
    kamar.fasilitas = list;
    const index = list.findIndex((f) => f.id === fasilitasId);
    if (m === 'PUT' && body) {
      if (index === -1) return { status: 404, body: { error: 'Fasilitas tidak ditemukan' } };
      const nama = String(body.nama ?? list[index].nama).trim();
      const tanggal = String(body.tanggal ?? list[index].tanggal).trim();
      if (!nama || !tanggal) {
        return { status: 400, body: { error: 'Nama dan tanggal fasilitas wajib diisi' } };
      }
      list[index] = {
        ...list[index],
        nama,
        tanggal,
        keterangan:
          body.keterangan != null ? String(body.keterangan).trim() : list[index].keterangan,
      };
      if (shouldPersistToSqlite()) {
        await sqlUpsertKamarRow(kamar);
      } else {
        await saveDb(SQL_SCOPE.kamar);
      }
      return { status: 200, body: list[index] };
    }
    if (m === 'DELETE') {
      if (index === -1) return { status: 404, body: { error: 'Fasilitas tidak ditemukan' } };
      kamar.fasilitas = list.filter((f) => f.id !== fasilitasId);
      if (shouldPersistToSqlite()) {
        await sqlUpsertKamarRow(kamar);
      } else {
        await saveDb(SQL_SCOPE.kamar);
      }
      return { status: 200, body: { success: true } };
    }
  }

  const kamarFasilitasMatch = pathname.match(/^\/api\/kamar\/([^/]+)\/fasilitas$/);
  if (kamarFasilitasMatch && m === 'POST' && body) {
    const kamar = db.kamar.find((k) => k.id === kamarFasilitasMatch[1]) as Record<string, unknown> | undefined;
    if (!kamar) return { status: 404, body: { error: 'Kamar tidak ditemukan' } };
    const nama = String(body.nama ?? '').trim();
    const tanggal = String(body.tanggal ?? '').trim();
    if (!nama || !tanggal) {
      return { status: 400, body: { error: 'Nama dan tanggal fasilitas wajib diisi' } };
    }
    const list = Array.isArray(kamar.fasilitas)
      ? (kamar.fasilitas as Record<string, unknown>[])
      : [];
    const item = {
      id: newId(),
      nama,
      tanggal,
      keterangan: body.keterangan ? String(body.keterangan).trim() : '',
    };
    list.push(item);
    kamar.fasilitas = list;
    if (shouldPersistToSqlite()) {
      await sqlUpsertKamarRow(kamar);
    } else {
      await saveDb(SQL_SCOPE.kamar);
    }
    return { status: 200, body: item };
  }

  const kamarIdMatch = pathname.match(/^\/api\/kamar\/([^/]+)$/);
  if (kamarIdMatch) {
    const id = kamarIdMatch[1];
    if (m === 'PUT' && body) {
      const index = db.kamar.findIndex((k) => k.id === id);
      if (index === -1) return { status: 404, body: { error: 'Kamar tidak ditemukan' } };
      const oldNama = db.kamar[index].nama;
      db.kamar[index] = {
        ...db.kamar[index],
        ...body,
        kapasitas: Number(body.kapasitas ?? db.kamar[index].kapasitas) || 4,
      };
      if (body.nama && body.nama !== oldNama) {
        db.santri.forEach((s) => {
          if (s.kamar === oldNama) s.kamar = body.nama;
        });
      }
      const updated = db.kamar[index];
      if (shouldPersistToSqlite()) {
        await sqlUpsertKamarRow(updated);
        if (body.nama && body.nama !== oldNama) {
          for (const s of db.santri) {
            if (s.kamar === body.nama) {
              await sqlUpsertSantriRow(s as Record<string, unknown>, db.kamar);
            }
          }
        }
        queueTursoPush();
      } else {
        await saveDb(SQL_SCOPE.kamar);
      }
      return { status: 200, body: updated };
    }
    if (m === 'DELETE') {
      const kamar = db.kamar.find((k) => k.id === id);
      if (kamar) {
        db.santri.forEach((s) => {
          if (s.kamar === kamar.nama) {
            s.kamar = '';
            delete s.masuk_kamar_sejak;
          }
        });
      }
      db.kamar = db.kamar.filter((k) => k.id !== id);
      if (shouldPersistToSqlite()) {
        await sqlVacateKamarResidents(id);
        await saveDb(['kamar']);
      } else {
        await saveDb(SQL_SCOPE.kamarDelete);
      }
      return { status: 200, body: { success: true } };
    }
  }

  if (pathname === '/api/kelas/seed-defaults' && m === 'POST') {
    db.kelas = buildDefaultKelasRecords(newId, { stableIds: true });
    await saveDb(SQL_SCOPE.kelas);
    return { status: 200, body: db.kelas };
  }

  if (pathname === '/api/kelas') {
    if (m === 'GET') {
      if (seedDefaultKelasIfEmpty()) await saveDb(SQL_SCOPE.kelas);
      return { status: 200, body: db.kelas };
    }
    if (m === 'POST' && body) {
      const item: KelasRecord = {
        id: newId(),
        nama: String(body.nama ?? '').trim(),
        tingkat: String(body.tingkat ?? ''),
      };
      db.kelas.push(item);
      await saveDb(SQL_SCOPE.kelas);
      return { status: 200, body: item };
    }
  }

  const kelasIdMatch = pathname.match(/^\/api\/kelas\/([^/]+)$/);
  if (kelasIdMatch) {
    const id = kelasIdMatch[1];
    if (m === 'PUT' && body) {
      const index = db.kelas.findIndex((k) => k.id === id);
      if (index === -1) return { status: 404, body: { error: 'Kelas tidak ditemukan' } };
      db.kelas[index] = { ...db.kelas[index], ...body };
      await saveDb(SQL_SCOPE.kelas);
      return { status: 200, body: db.kelas[index] };
    }
    if (m === 'DELETE') {
      db.kelas = db.kelas.filter((k) => k.id !== id);
      await saveDb(SQL_SCOPE.kelas);
      return { status: 200, body: { success: true } };
    }
  }

  if (pathname === '/api/kegiatan') {
    if (m === 'GET') {
      return { status: 200, body: db.kegiatan };
    }
    if (m === 'POST' && body) {
      const item = { id: newId(), ...body };
      db.kegiatan.push(item);
      await saveDb(SQL_SCOPE.kegiatan);
      return { status: 200, body: item };
    }
  }

  const enrichPenjadwalan = (rows: PenjadwalanEntry[]) =>
    rows.map((row) => {
      if (row.assignee_nama?.trim()) {
        return row;
      }
      if (row.mode === 'kamar' && row.kamar_id) {
        const kamar = db.kamar.find((k) => k.id === row.kamar_id);
        const penghuni = db.santri.filter((s) => s.kamar === kamar?.nama);
        return {
          ...row,
          assignee_nama: kamar?.nama ? String(kamar.nama) : 'Kamar?',
          assignee_detail: kamar?.ketua
            ? `Ketua: ${String(kamar.ketua)}`
            : penghuni.length
              ? `${penghuni.length} santri`
              : undefined,
        };
      }
      if (row.santri_id) {
        const santri = db.santri.find((s) => s.id === row.santri_id);
        return {
          ...row,
          assignee_nama: santri?.nama ? String(santri.nama) : 'Santri?',
          assignee_detail: santri?.kamar ? String(santri.kamar) : undefined,
        };
      }
      return { ...row, assignee_nama: '-' };
    });

  if (pathname === '/api/penjadwalan/generate' && m === 'POST' && body) {
    const jenis = String(body.jenis ?? '').trim();
    const mode = body.mode === 'kamar' ? 'kamar' : 'santri';
    const mulai = typeof body.mulai === 'string' ? body.mulai.slice(0, 10) : '';
    const bulanKeDepan = Number(body.bulanKeDepan) || 1;
    const gantiYangAda = true;
    if (!jenis || !mulai) {
      return { status: 400, body: { error: 'Jenis dan tanggal mulai wajib diisi' } };
    }
    const { dari, sampai } = dateRangeForMonths(mulai, bulanKeDepan);
    const sScope = scopedSantriIds();
    const kScope = scopedKamarIds();
    const santriSource = (shouldPersistToSqlite()
      ? await sqlListSantriPenjadwalan()
      : (db.santri as { id: string; nama?: string; kamar?: string }[])
    ).filter((s) => sScope.has(String(s.id)));
    const kamarSource = (shouldPersistToSqlite()
      ? await sqlListKamarPenjadwalan()
      : (db.kamar as { id: string; nama?: string }[])
    ).filter((k) => kScope.has(String(k.id)));
    if (shouldPersistToSqlite()) {
      db.penjadwalan = (await sqlListPenjadwalanRaw()) as Record<string, unknown>[];
    }
    if (gantiYangAda) {
      if (shouldPersistToSqlite()) {
        await sqlDeletePenjadwalanJenisRange(jenis, dari, sampai);
      }
      db.penjadwalan = db.penjadwalan.filter(
        (p) =>
          p.jenis !== jenis ||
          typeof p.tanggal !== 'string' ||
          String(p.tanggal) < dari ||
          String(p.tanggal) > sampai
      );
    }
    const batchId = newId();
    const generatedAt = new Date().toISOString();
    const generatedAll = buildGeneratedEntries(
      { jenis, mode, mulai, bulanKeDepan, gantiYangAda },
      santriSource,
      kamarSource,
      newId,
      { generatedAt, batchId }
    );
    const existingJadwal = db.penjadwalan as PenjadwalanEntry[];
    let generated = generatedAll;
    if (!gantiYangAda) {
      generated = filterPenjadwalanWithoutReplacing(existingJadwal, generated, jenis);
    }
    db.penjadwalan.push(...(generated as Record<string, unknown>[]));
    db.penjadwalanPreset = upsertPenjadwalanPreset(
      db.penjadwalanPreset,
      { jenis, mode, mulai, bulanKeDepan, gantiYangAda },
      newId
    );
    if (shouldPersistToSqlite()) {
      await saveDb(SQL_SCOPE.jadwal, { fullHeavyFlush: true });
    } else {
      await saveDb(SQL_SCOPE.jadwal);
    }
    const items = shouldPersistToSqlite()
      ? await sqlEnrichPenjadwalan(generated, db.kamar)
      : enrichPenjadwalan(generated);
    return {
      status: 200,
      body: {
        created: generated.length,
        skipped: generatedAll.length - generated.length,
        totalInRange: generatedAll.length,
        dari,
        sampai,
        items,
      },
    };
  }

  if (pathname === '/api/penjadwalan/presets' && m === 'GET') {
    return { status: 200, body: db.penjadwalanPreset };
  }

  if (pathname === '/api/penjadwalan/clear' && m === 'POST' && body) {
    const jenis = String(body.jenis ?? '').trim();
    const bulan = typeof body.bulan === 'string' ? body.bulan.slice(0, 7) : '';
    if (!jenis || !bulan) {
      return { status: 400, body: { error: 'Jenis dan bulan wajib' } };
    }
    const before = db.penjadwalan.length;
    if (shouldPersistToSqlite()) {
      await sqlDeletePenjadwalanJenisBulan(jenis, bulan);
    }
    db.penjadwalan = db.penjadwalan.filter(
      (p) => p.jenis !== jenis || !String(p.tanggal).startsWith(bulan)
    );
    if (!shouldPersistToSqlite()) {
      await saveDb(SQL_SCOPE.jadwal);
    }
    return { status: 200, body: { removed: before - db.penjadwalan.length } };
  }

  if (pathname === '/api/penjadwalan/purge-jenis' && m === 'POST' && body) {
    const jenis = String(body.jenis ?? '').trim();
    if (!jenis) {
      return { status: 400, body: { error: 'Jenis wajib' } };
    }
    const before = db.penjadwalan.filter((p) => p.jenis === jenis).length;
    if (shouldPersistToSqlite()) {
      await sqlDeletePenjadwalanByJenis(jenis);
      await sqlDeletePenjadwalanPresetByJenis(jenis);
    }
    db.penjadwalan = db.penjadwalan.filter((p) => p.jenis !== jenis);
    db.penjadwalanPreset = db.penjadwalanPreset.filter((p) => p.jenis !== jenis);
    if (shouldPersistToSqlite()) {
      await saveDb(SQL_SCOPE.jadwal, { fullHeavyFlush: true });
    } else {
      await saveDb(SQL_SCOPE.jadwal);
    }
    return { status: 200, body: { removed: before } };
  }

  if (pathname === '/api/penjadwalan' && m === 'GET') {
    const sScope = scopedSantriIds();
    const kScope = scopedKamarIds();
    const jadwalInScope = (p: PenjadwalanEntry) =>
      p.mode === 'kamar'
        ? !p.assignee_kamar_id || kScope.has(String(p.assignee_kamar_id))
        : !p.assignee_santri_id || sScope.has(String(p.assignee_santri_id));
    const rows = (
      shouldPersistToSqlite() && !db.penjadwalan.length
        ? await sqlListPenjadwalanRaw()
        : ([...db.penjadwalan] as PenjadwalanEntry[])
    ).filter(jadwalInScope);
    const sorted = rows.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
    const body = shouldPersistToSqlite()
      ? await sqlEnrichPenjadwalan(sorted, db.kamar)
      : enrichPenjadwalan(sorted);
    return { status: 200, body };
  }

  const penjadwalanIdMatch = pathname.match(/^\/api\/penjadwalan\/([^/]+)$/);
  if (penjadwalanIdMatch) {
    const id = penjadwalanIdMatch[1];
    if (m === 'PUT' && body) {
      let index = db.penjadwalan.findIndex((p) => p.id === id);
      if (index === -1 && shouldPersistToSqlite()) {
        db.penjadwalan = (await sqlListPenjadwalanRaw()) as Record<string, unknown>[];
        index = db.penjadwalan.findIndex((p) => p.id === id);
      }
      if (index === -1) return { status: 404, body: { error: 'Jadwal tidak ditemukan' } };
      db.penjadwalan[index] = { ...db.penjadwalan[index], ...body, id };
      if (shouldPersistToSqlite()) {
        await sqlUpsertPenjadwalanRow(db.penjadwalan[index]);
      } else {
        await saveDb(SQL_SCOPE.jadwal);
      }
      return { status: 200, body: db.penjadwalan[index] };
    }
    if (m === 'DELETE') {
      db.penjadwalan = db.penjadwalan.filter((p) => p.id !== id);
      if (shouldPersistToSqlite()) {
        await sqlDeletePenjadwalanById(id);
      } else {
        await saveDb(SQL_SCOPE.jadwal);
      }
      return { status: 200, body: { success: true } };
    }
  }

  const kegiatanIdMatch = pathname.match(/^\/api\/kegiatan\/([^/]+)$/);
  if (kegiatanIdMatch) {
    const id = kegiatanIdMatch[1];
    if (m === 'PUT' && body) {
      const index = db.kegiatan.findIndex((k) => k.id === id);
      if (index === -1) return { status: 404, body: { error: 'Kegiatan tidak ditemukan' } };
      db.kegiatan[index] = { ...db.kegiatan[index], ...body };
      await saveDb(SQL_SCOPE.kegiatan);
      return { status: 200, body: db.kegiatan[index] };
    }
    if (m === 'DELETE') {
      db.kegiatan = db.kegiatan.filter((k) => k.id !== id);
      await saveDb(SQL_SCOPE.kegiatan);
      return { status: 200, body: { success: true } };
    }
  }

  if (pathname === '/api/backup') {
    if (m === 'GET') {
      if (shouldPersistToSqlite()) {
        const full = await sqlLoadFullSnapshotForBackup();
        if (full) return { status: 200, body: full };
      }
      return {
        status: 200,
        body: {
          santri: db.santri,
          kamar: db.kamar,
          kelas: db.kelas,
          kegiatan: db.kegiatan,
          penjadwalan: db.penjadwalan,
          penjadwalanPreset: db.penjadwalanPreset,
          absensi: db.absensi,
          izin: db.izin,
          pembinaan: db.pembinaan,
          riwayat_kamar: db.riwayat_kamar,
          settings: db.settings,
        },
      };
    }
    if (m === 'POST' && body) {
      try {
        await flushClientApiPersist();
        db = normalizeDb({
          ...body,
          settings: {
            ...db.settings,
            ...((body.settings as object) || {}),
          },
        });
        reconcilePenjadwalanPresets();
        if (shouldPersistToSqlite()) {
          await persistFullSqliteSnapshot();
        } else {
          await saveDb(SQL_ENTITIES_ALL);
        }
        return { status: 200, body: { success: true } };
      } catch (err) {
        return sqliteErrorToApiResult(err);
      }
    }
  }

  if (pathname === '/api/backup/clear-scope' && m === 'POST' && body) {
    const scope = (body as { scope?: string }).scope;
    if (!scope || !BACKUP_CLEAR_SCOPES.includes(scope as BackupClearScope)) {
      return { status: 400, body: { error: 'Pilih: absensi, izin, atau pelanggaran' } };
    }
    try {
      await clearBackupScope(scope as BackupClearScope);
      return { status: 200, body: { success: true, scope } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengosongkan data';
      return { status: 500, body: { error: message } };
    }
  }

  if (pathname === '/api/backup/clear' && m === 'POST') {
    try {
      await flushClientApiPersist();
      const auth = snapshotAuthSettings(db.settings);
      const setupSelesai = db.settings.setupSelesai;
      db = normalizeDb({
        settings: mergeAppSettings({
          ...db.settings,
          ...auth,
          setupSelesai,
        }),
      });
      afterDbHydrated();
      if (shouldPersistToSqlite()) {
        await persistFullSqliteSnapshot();
      } else {
        clearLegacyWebStorage();
        await saveDb(SQL_ENTITIES_ALL);
      }
      await clearAllPembayaran();
      return { status: 200, body: { success: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus data';
      return { status: 500, body: { error: message } };
    }
  }

  if (pathname === '/api/backup/restore-initial' && m === 'POST') {
    try {
      await flushClientApiPersist();
      const auth = snapshotAuthSettings(db.settings);
      db = normalizeDb(getInitialDbSnapshot());
      db.settings = mergeAppSettings({ ...db.settings, ...auth, setupSelesai: false });
      afterDbHydrated();
      if (shouldPersistToSqlite()) {
        await persistFullSqliteSnapshot();
      } else {
        clearLegacyWebStorage();
        await saveDb(SQL_ENTITIES_ALL);
      }
      await clearAllPembayaran();
      return { status: 200, body: { success: true } };
    } catch (err) {
      return sqliteErrorToApiResult(err);
    }
  }

  if (pathname === '/api/izin' && m === 'GET') {
    const dari = (searchParams.get('dari') ?? '').trim().slice(0, 10);
    const sampai = (searchParams.get('sampai') ?? '').trim().slice(0, 10);
    const sIds = scopedSantriIds();
    const inScope = (r: Record<string, unknown>) => sIds.has(String(r.santri_id ?? ''));
    if (shouldPersistToSqlite() && dari && sampai) {
      return { status: 200, body: (await sqlListIzinInRange(dari, sampai)).filter(inScope) };
    }
    if (shouldPersistToSqlite()) {
      return { status: 200, body: (await sqlListIzinEnriched()).filter(inScope) };
    }
    const enrichedIzin: Record<string, unknown>[] = [];
    for (const i of db.izin.filter(inScope)) {
      const base = await enrichWithSantriFields(i as Record<string, unknown>);
      const sid = i.santri_id ? normalizeSantriId(i.santri_id) : '';
      const santri = sid ? await resolveSantriRecord(sid) : null;
      enrichedIzin.push({
        ...base,
        santri_wali: santri?.nomor_wali ? String(santri.nomor_wali) : '-',
      });
    }
    enrichedIzin.sort(
      (a, b) =>
        new Date(String(b.tanggal_keluar)).getTime() -
        new Date(String(a.tanggal_keluar)).getTime()
    );
    return { status: 200, body: enrichedIzin };
  }

  if (pathname === '/api/izin' && m === 'POST' && body) {
    const santriId = body.santri_id as string | undefined;
    if (santriId) {
      const masihIzin = shouldPersistToSqlite()
        ? await sqlFindIzinBelumForSantri(santriId)
        : db.izin.find((i) => i.santri_id === santriId && i.status_kembali === 'Belum');
      if (masihIzin) {
        return {
          status: 409,
          body: {
            error: 'Santri masih sedang izin. Tandai sudah kembali terlebih dahulu.',
          },
        };
      }
    }
    const santriGuard = await ensureSantriForChildWrite(body.santri_id);
    if (santriGuard) return santriGuard;
    const now = new Date().toISOString();
    const createdRaw = body.created_at;
    const created_at =
      typeof createdRaw === 'string' && createdRaw.trim() ? createdRaw.trim() : now;
    const newIzin = { id: newId(), status_kembali: 'Belum', ...body, created_at };
    db.izin.push(newIzin);
    if (shouldPersistToSqlite()) {
      await sqlInsertIzin(newIzin);
    } else {
      await saveDb(SQL_SCOPE.izin);
    }
    return { status: 200, body: newIzin };
  }

  const izinKembaliMatch = pathname.match(/^\/api\/izin\/([^/]+)\/kembali$/);
  if (izinKembaliMatch && m === 'PUT') {
    let izin = db.izin.find((i) => i.id === izinKembaliMatch[1]) as Record<string, unknown> | undefined;
    if (!izin && shouldPersistToSqlite()) {
      const list = await sqlListIzinEnriched();
      izin = list.find((i) => i.id === izinKembaliMatch[1]);
    }
    if (!izin) return { status: 404, body: { error: 'Izin tidak ditemukan' } };
    izin.status_kembali = 'Sudah';
    izin.waktu_kembali_aktual = new Date().toISOString();
    if (shouldPersistToSqlite()) {
      await sqlUpdateIzinRow(izin);
    } else {
      await saveDb(SQL_SCOPE.izin);
    }
    return { status: 200, body: { success: true, izin } };
  }

  const izinIdMatch = pathname.match(/^\/api\/izin\/([^/]+)$/);
  if (izinIdMatch && m === 'DELETE') {
    db.izin = db.izin.filter((i) => i.id !== izinIdMatch[1]);
    if (shouldPersistToSqlite()) {
      await sqlDeleteIzinById(izinIdMatch[1]);
    } else {
      await saveDb(SQL_SCOPE.izin);
    }
    return { status: 200, body: { success: true } };
  }

  if (pathname === '/api/pembinaan' && m === 'GET') {
    const dari = (searchParams.get('dari') ?? '').trim().slice(0, 10);
    const sampai = (searchParams.get('sampai') ?? '').trim().slice(0, 10);
    const sIds = scopedSantriIds();
    const inScope = (r: Record<string, unknown>) => sIds.has(String(r.santri_id ?? ''));
    if (shouldPersistToSqlite() && dari && sampai) {
      return { status: 200, body: (await sqlListPembinaanInRange(dari, sampai)).filter(inScope) };
    }
    if (shouldPersistToSqlite()) {
      return { status: 200, body: (await sqlListPembinaanEnriched()).filter(inScope) };
    }
    const enriched: Record<string, unknown>[] = [];
    for (const p of db.pembinaan.filter(inScope)) {
      enriched.push(await enrichWithSantriFields(p as Record<string, unknown>));
    }
    enriched.sort(
      (a, b) =>
        new Date(String(b.tanggal)).getTime() - new Date(String(a.tanggal)).getTime()
    );
    return { status: 200, body: enriched };
  }

  if (pathname === '/api/pembinaan' && m === 'POST' && body) {
    const santriGuard = await ensureSantriForChildWrite(body.santri_id);
    if (santriGuard) return santriGuard;
    const jenis = body.jenis === 'Teguran' ? 'Teguran' : 'Pelanggaran';
    const newPembinaan = { id: newId(), ...body, jenis };
    db.pembinaan.push(newPembinaan);
    const santri = await ensureSantriInMemory(String(body.santri_id ?? ''));
    if (santri && jenis === 'Pelanggaran') {
      santri.jumlah_pelanggaran = (Number(santri.jumlah_pelanggaran) || 0) + 1;
      if (shouldPersistToSqlite()) {
        await sqlBumpSantriPelanggaran(String(santri.id), 1);
      }
    }
    if (shouldPersistToSqlite()) {
      await sqlInsertPembinaan(newPembinaan);
    } else {
      await saveDb([...SQL_SCOPE.pembinaan, ...SQL_SCOPE.santri]);
    }
    return { status: 200, body: newPembinaan };
  }

  const pembinaanIdMatch = pathname.match(/^\/api\/pembinaan\/([^/]+)$/);
  if (pembinaanIdMatch && m === 'DELETE') {
    const removed = db.pembinaan.find((p) => p.id === pembinaanIdMatch[1]) as
      | { santri_id?: string }
      | undefined;
    const santriId = removed?.santri_id ? String(removed.santri_id) : '';
    db.pembinaan = db.pembinaan.filter((p) => p.id !== pembinaanIdMatch[1]);
    if (shouldPersistToSqlite()) {
      await sqlDeletePembinaanById(pembinaanIdMatch[1]);
      if (santriId) {
        const count = await sqlRecalculateSantriPelanggaran(santriId);
        const santri = db.santri.find((s) => String(s.id) === santriId) as
          | { jumlah_pelanggaran?: number }
          | undefined;
        if (santri) santri.jumlah_pelanggaran = count;
      }
    } else {
      if (santriId) {
        const count = db.pembinaan.filter(
          (p) => String((p as { santri_id?: string }).santri_id) === santriId &&
            (p as { jenis?: string }).jenis === 'Pelanggaran'
        ).length;
        const santri = db.santri.find((s) => String(s.id) === santriId) as
          | { jumlah_pelanggaran?: number }
          | undefined;
        if (santri) santri.jumlah_pelanggaran = count;
      }
      await saveDb([...SQL_SCOPE.pembinaan, ...SQL_SCOPE.santri]);
    }
    return { status: 200, body: { success: true } };
  }

  if (pathname === '/api/absensi' && m === 'GET') {
    const tanggal = (searchParams.get('tanggal') ?? '').trim().slice(0, 10);
    const kegiatan = (searchParams.get('kegiatan') ?? '').trim();
    const dari = (searchParams.get('dari') ?? '').trim().slice(0, 10);
    const sampai = (searchParams.get('sampai') ?? '').trim().slice(0, 10);
    const sIds = scopedSantriIds();
    const inScope = (r: Record<string, unknown>) => sIds.has(String(r.santri_id ?? ''));

    if (shouldPersistToSqlite() && tanggal) {
      return {
        status: 200,
        body: (await sqlListAbsensiForDate(tanggal, kegiatan || undefined)).filter(inScope),
      };
    }
    if (shouldPersistToSqlite() && dari && sampai) {
      return { status: 200, body: (await sqlListAbsensiInRange(dari, sampai)).filter(inScope) };
    }
    if (shouldPersistToSqlite()) {
      return { status: 200, body: (await sqlListAbsensiEnriched()).filter(inScope) };
    }

    const enrichAbsensiList = async (rows: Record<string, unknown>[]) => {
      const out: Record<string, unknown>[] = [];
      for (const a of rows) {
        out.push(await enrichWithSantriFields(a));
      }
      return out;
    };

    if (tanggal) {
      const filtered = db.absensi.filter(
        (a) =>
          inScope(a as Record<string, unknown>) &&
          String(a.tanggal).startsWith(tanggal) &&
          (!kegiatan || a.kegiatan === kegiatan)
      ) as Record<string, unknown>[];
      return { status: 200, body: await enrichAbsensiList(filtered) };
    }
    if (dari && sampai) {
      const start = `${dari}T00:00:00`;
      const end = `${sampai}T23:59:59.999`;
      const filtered = db.absensi.filter((a) => {
        const t = String(a.tanggal);
        return inScope(a as Record<string, unknown>) && t >= start && t <= end;
      }) as Record<string, unknown>[];
      return { status: 200, body: await enrichAbsensiList(filtered) };
    }

    const all = await enrichAbsensiList(
      (db.absensi as Record<string, unknown>[]).filter(inScope)
    );
    all.sort(
      (a, b) => new Date(String(b.tanggal)).getTime() - new Date(String(a.tanggal)).getTime()
    );
    return { status: 200, body: all };
  }

  if (pathname === '/api/absensi' && m === 'POST' && body) {
    const { santri_id, kegiatan, tanggal, status } = body;
    const santriGuard = await ensureSantriForChildWrite(santri_id);
    if (santriGuard) return santriGuard;
    const dateKey = typeof tanggal === 'string' ? tanggal.slice(0, 10) : '';
    let existingIdx = db.absensi.findIndex(
      (a) =>
        a.santri_id === santri_id &&
        a.kegiatan === kegiatan &&
        typeof a.tanggal === 'string' &&
        String(a.tanggal).startsWith(dateKey)
    );
    let existingRow: Record<string, unknown> | null = null;
    if (existingIdx < 0 && shouldPersistToSqlite()) {
      existingRow = await sqlFindAbsensiByKey(
        String(santri_id),
        String(kegiatan),
        dateKey
      );
    }
    if (existingIdx >= 0 || existingRow) {
      const row =
        existingIdx >= 0
          ? { ...db.absensi[existingIdx], status, tanggal }
          : { ...existingRow, status, tanggal };
      if (existingIdx >= 0) {
        db.absensi[existingIdx] = row;
      }
      if (shouldPersistToSqlite()) {
        await sqlUpsertAbsensiRow(row, db.kegiatan);
      } else {
        await saveDb(SQL_SCOPE.absensi);
      }
      return { status: 200, body: row };
    }
    const newAbsensi = { id: newId(), santri_id, kegiatan, tanggal, status };
    db.absensi.push(newAbsensi);
    if (shouldPersistToSqlite()) {
      await sqlUpsertAbsensiRow(newAbsensi, db.kegiatan);
    } else {
      await saveDb(SQL_SCOPE.absensi);
    }
    return { status: 200, body: newAbsensi };
  }

  const absensiIdMatch = pathname.match(/^\/api\/absensi\/([^/]+)$/);
  if (absensiIdMatch && m === 'DELETE') {
    let row = db.absensi.find((a) => a.id === absensiIdMatch[1]) as Record<string, unknown> | undefined;
    if (!row && shouldPersistToSqlite()) {
      const all = await sqlListAbsensiEnriched();
      row = all.find((a) => a.id === absensiIdMatch[1]);
    }
    if (!row) return { status: 404, body: { error: 'Absensi tidak ditemukan' } };
    const dateKey = String(row.tanggal ?? '').slice(0, 10);
    const santriId = String(row.santri_id ?? '');
    const izinRows = db.izin as IzinRow[];
    if (dateKey && santriId && isSantriOnIzinForDate(izinRows, santriId, dateKey)) {
      return {
        status: 403,
        body: {
          error:
            'Absensi izin dari data Izin Keluar tidak bisa dibatalkan. Ubah status kembali di halaman Izin jika perlu.',
        },
      };
    }
    db.absensi = db.absensi.filter((a) => a.id !== absensiIdMatch[1]);
    if (shouldPersistToSqlite()) {
      await sqlDeleteAbsensiById(absensiIdMatch[1]);
    } else {
      await saveDb(SQL_SCOPE.absensi);
    }
    return { status: 200, body: { success: true } };
  }

  return { status: 404, body: { error: 'Not found' } };
}

/** Normalisasi path API (Capacitor sering memakai URL penuh https://localhost/api/...). */
function normalizeApiPath(urlOrPath: string): string {
  const withoutQuery = urlOrPath.split('?')[0];
  if (withoutQuery.startsWith('http://') || withoutQuery.startsWith('https://')) {
    return new URL(withoutQuery).pathname;
  }
  return withoutQuery;
}

function resolveFetchUrl(input: RequestInfo | URL): { pathname: string; searchParams: URLSearchParams } {
  let raw: string;
  if (typeof input === 'string') raw = input;
  else if (input instanceof URL) raw = input.toString();
  else raw = input.url;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    const u = new URL(raw);
    return { pathname: u.pathname, searchParams: u.searchParams };
  }
  const [pathPart, query = ''] = raw.split('?');
  return {
    pathname: normalizeApiPath(pathPart),
    searchParams: new URLSearchParams(query),
  };
}

class ClientApiResponse {
  readonly ok: boolean;
  readonly status: number;
  private readonly data: unknown;

  constructor(status: number, data: unknown) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this.data = data;
  }

  async json() {
    return this.data;
  }

  async text() {
    return typeof this.data === 'string' ? this.data : JSON.stringify(this.data);
  }
}

export async function clientApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { pathname, searchParams } = resolveFetchUrl(input);
  const method = init?.method ?? 'GET';
  let body: Record<string, unknown> | null = null;
  if (init?.body && typeof init.body === 'string') {
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      body = null;
    }
  }
  const { status, body: responseBody } = await dispatchApi(method, pathname, searchParams, body);
  return new ClientApiResponse(status, responseBody) as unknown as Response;
}

/** Capacitor WebView (sering melaporkan platform "web" sebelum plugin siap). */
function isCapacitorWebView(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'capacitor:') return true;
  if (window.location.protocol === 'https:' && window.location.hostname === 'localhost') {
    const port = window.location.port;
    return port === '' || port === '443';
  }
  return false;
}

/** Local-first: semua platform memakai client-api + SQLite (bukan Express data.json). */
function shouldUseClientApiStore(): boolean {
  return true;
}

async function isSpaHtmlResponse(res: Response): Promise<boolean> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return false;
  try {
    const peek = await res.clone().text();
    const head = peek.trimStart().slice(0, 32).toLowerCase();
    return head.startsWith('<!doctype') || head.startsWith('<html');
  } catch {
    return false;
  }
}

export function installNativeApiFetch(): void {
  if (typeof window === 'undefined') return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname: path } = resolveFetchUrl(input);
    if (path.startsWith('/api')) {
      return clientApiFetch(input, init);
    }
    return nativeFetch(input, init);
  };
}
