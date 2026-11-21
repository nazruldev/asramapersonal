import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { AppSettings } from './app-settings';
import type { PenjadwalanPreset } from './penjadwalan';
import {
  resolveRiwayatKamarSebelumnyaFields,
  type SantriKamarRiwayatRow,
} from './santri-kamar-riwayat';
import {
  coerceKamarForeignKeyId,
  filterSnapshotChildRows,
} from './sqlite-fk';
import { SCHEMA_V4_SQL, DROP_ENTITY_TABLES_V4_SQL } from './db/schema-v4';
import { currentActorName } from './app-auth';
import { transformOfflineSnapshotToV4 } from './db/migrate-v4-snapshot';
import { resolveKelasId, kelasNamaById } from './db/kelas-resolve';
import { normalizeDateKey } from './db/date-normalize';
import { penjadwalanRowToEntry, penjadwalanInsertParams } from './db/penjadwalan-storage';
const DB_NAME = 'asrama_db';
const SCHEMA_VERSION = 4;
const LEGACY_KV_KEY = 'asrama_manager_db';

export type { OfflineDbSnapshot } from './db/snapshot-types';
import type { OfflineDbSnapshot } from './db/snapshot-types';

const META_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

const SCHEMA_V3_SQL = `
  CREATE TABLE IF NOT EXISTS kamar (
    id TEXT PRIMARY KEY NOT NULL,
    nama TEXT NOT NULL UNIQUE,
    kapasitas INTEGER NOT NULL DEFAULT 4,
    lantai TEXT,
    ketua TEXT,
    fasilitas_json TEXT
  );

  CREATE TABLE IF NOT EXISTS kelas (
    id TEXT PRIMARY KEY NOT NULL,
    nama TEXT NOT NULL,
    tingkat TEXT
  );

  CREATE TABLE IF NOT EXISTS kegiatan (
    id TEXT PRIMARY KEY NOT NULL,
    nama TEXT NOT NULL,
    jenis TEXT,
    jam_mulai TEXT,
    jam_selesai TEXT,
    waktu TEXT,
    urutan INTEGER DEFAULT 0,
    untuk_absensi INTEGER DEFAULT 0,
    hari_aktif_json TEXT
  );

  CREATE TABLE IF NOT EXISTS santri (
    id TEXT PRIMARY KEY NOT NULL,
    nama TEXT NOT NULL,
    kelas TEXT,
    kamar_id TEXT REFERENCES kamar(id) ON DELETE SET NULL,
    nomor_wali TEXT,
    include_wa INTEGER DEFAULT 1,
    catatan TEXT,
    catatan_medis TEXT,
    foto TEXT,
    jumlah_pelanggaran INTEGER DEFAULT 0,
    masuk_kamar_sejak TEXT,
    asal_provinsi_code TEXT,
    asal_provinsi_nama TEXT,
    asal_kota_code TEXT,
    asal_kota_nama TEXT,
    asal_kecamatan_code TEXT,
    asal_kecamatan_nama TEXT,
    asal_desa_code TEXT,
    asal_desa_nama TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_santri_nama ON santri(nama);
  CREATE INDEX IF NOT EXISTS idx_santri_kelas ON santri(kelas);
  CREATE INDEX IF NOT EXISTS idx_santri_kamar_id ON santri(kamar_id);

  CREATE TABLE IF NOT EXISTS penjadwalan_preset (
    id TEXT PRIMARY KEY NOT NULL,
    jenis TEXT NOT NULL,
    mode TEXT NOT NULL,
    mulai TEXT NOT NULL,
    bulan_ke_depan INTEGER NOT NULL,
    ganti_yang_ada INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS penjadwalan (
    id TEXT PRIMARY KEY NOT NULL,
    jenis TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    mode TEXT NOT NULL,
    santri_id TEXT REFERENCES santri(id) ON DELETE CASCADE,
    kamar_id TEXT REFERENCES kamar(id) ON DELETE CASCADE,
    catatan TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_penjadwalan_tanggal ON penjadwalan(tanggal);

  CREATE TABLE IF NOT EXISTS absensi (
    id TEXT PRIMARY KEY NOT NULL,
    santri_id TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    kegiatan_id TEXT REFERENCES kegiatan(id) ON DELETE SET NULL,
    kegiatan_label TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    status TEXT NOT NULL,
    catatan TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi(tanggal);
  CREATE INDEX IF NOT EXISTS idx_absensi_santri ON absensi(santri_id);

  CREATE TABLE IF NOT EXISTS izin (
    id TEXT PRIMARY KEY NOT NULL,
    santri_id TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    alasan TEXT NOT NULL,
    tanggal_keluar TEXT NOT NULL,
    batas_kembali TEXT NOT NULL,
    status_kembali TEXT NOT NULL,
    penjemput TEXT,
    waktu_kembali_aktual TEXT,
    created_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_izin_santri ON izin(santri_id);

  CREATE TABLE IF NOT EXISTS pembinaan (
    id TEXT PRIMARY KEY NOT NULL,
    santri_id TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    jenis TEXT NOT NULL,
    keterangan TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    tindak_lanjut TEXT,
    created_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pembinaan_santri ON pembinaan(santri_id);

  CREATE TABLE IF NOT EXISTS riwayat_kamar (
    id TEXT PRIMARY KEY NOT NULL,
    santri_id TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    kamar_id TEXT REFERENCES kamar(id) ON DELETE SET NULL,
    kamar_nama TEXT NOT NULL,
    tipe TEXT NOT NULL,
    tanggal TEXT NOT NULL,
    kamar_sebelumnya TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_riwayat_kamar_santri ON riwayat_kamar(santri_id);
`;

const DROP_ENTITY_TABLES_SQL = `
  DROP TABLE IF EXISTS riwayat_kamar;
  DROP TABLE IF EXISTS pembinaan;
  DROP TABLE IF EXISTS izin;
  DROP TABLE IF EXISTS absensi;
  DROP TABLE IF EXISTS penjadwalan;
  DROP TABLE IF EXISTS penjadwalan_preset;
  DROP TABLE IF EXISTS santri;
  DROP TABLE IF EXISTS kegiatan;
  DROP TABLE IF EXISTS kelas;
  DROP TABLE IF EXISTS kamar;
`;

const sqlite = new SQLiteConnection(CapacitorSQLite);
let conn: SQLiteDBConnection | null = null;
let schemaReady = false;
let writeChain: Promise<void> = Promise.resolve();

/** Satu antrian untuk SEMUA akses SQLite (baca + tulis) di APK — tanpa bypass (hindari race async). */
export function runSqlWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(() => fn());
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Jalankan query/read/write dengan mutex yang sama. */
export function runSqlExclusive<T>(
  fn: (db: SQLiteDBConnection) => Promise<T>
): Promise<T> {
  return runSqlWrite(async () => fn(await openConnection()));
}

/** Lepas transaksi yatim sebelum BEGIN (plugin Capacitor kadang tidak rollback). */
export async function safeBeginTransaction(db: SQLiteDBConnection): Promise<void> {
  try {
    const active = await db.isTransactionActive();
    if (active.result) {
      await db.rollbackTransaction();
    }
  } catch {
    try {
      await db.rollbackTransaction();
    } catch {
      /* ignore */
    }
  }
  await db.beginTransaction();
}

/** Koneksi tunggal untuk seluruh modul SQLite (hindari dua handle ke DB yang sama). */
export async function getSqlConnection(): Promise<SQLiteDBConnection> {
  return openConnection();
}

/**
 * Web: selalu localStorage (jeep-sqlite WASM bentrok di Vite).
 * Android/iOS: Capacitor SQLite.
 */
export function setWebSqliteAvailable(_ok: boolean): void {
  /* no-op: web tidak memakai SQLite */
}

export function shouldPersistToSqlite(): boolean {
  // Full-online Turso: sumber kebenaran cloud + RAM; jangan pakai SQLite entity store.
  const url = (import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined)?.trim();
  const token = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string | undefined)?.trim();
  if (url && token) return false;

  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' || Capacitor.isNativePlatform();
}

async function openConnection(): Promise<SQLiteDBConnection> {
  if (conn) return conn;

  const ret = await sqlite.checkConnectionsConsistency();
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;

  if (ret.result && isConn) {
    conn = await sqlite.retrieveConnection(DB_NAME, false);
  } else {
    conn = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  }

  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;');
  return conn;
}

async function ensureMetaTables(): Promise<void> {
  const db = await openConnection();
  await db.execute(META_TABLE_SQL);
}

async function createEntitySchemaV4(): Promise<void> {
  const db = await openConnection();
  await db.execute(SCHEMA_V4_SQL);
}

async function getMeta(key: string): Promise<string | null> {
  const db = await openConnection();
  const result = await db.query(`SELECT value FROM app_meta WHERE key = ?`, [key]);
  if (result.values?.length) {
    const row = result.values[0] as { value?: string };
    return typeof row.value === 'string' ? row.value : null;
  }
  return null;
}

async function readLegacyKvBlob(): Promise<string | null> {
  const db = await openConnection();
  const result = await db.query(`SELECT value FROM kv_store WHERE key = ?`, [LEGACY_KV_KEY]);
  if (result.values?.length) {
    const row = result.values[0] as { value?: string };
    return typeof row.value === 'string' ? row.value : null;
  }
  return null;
}

async function deleteLegacyKvBlob(): Promise<void> {
  const db = await openConnection();
  await db.run(`DELETE FROM kv_store WHERE key = ?`, [LEGACY_KV_KEY]);
}

async function tableHasColumn(table: string, column: string): Promise<boolean> {
  const db = await openConnection();
  const result = await db.query(`PRAGMA table_info(${table})`);
  if (!result.values?.length) return false;
  return result.values.some((row) => (row as { name?: string }).name === column);
}

function strField(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v === undefined || v === null ? '' : String(v);
}

function optStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (v === undefined || v === null || v === '') return null;
  return String(v);
}

function boolToInt(row: Record<string, unknown>, key: string): number {
  return row[key] === false ? 0 : 1;
}

function resolveKamarId(
  kamarList: Record<string, unknown>[],
  kamarNama: string
): string | null {
  const trimmed = kamarNama.trim();
  if (!trimmed) return null;
  const hit = kamarList.find((k) => String(k.nama ?? '').trim() === trimmed);
  return hit ? String(hit.id) : null;
}

/** Buang baris yatim agar INSERT tidak gagal di FOREIGN KEY (production). */
function sanitizeSnapshotForForeignKeys(snapshot: OfflineDbSnapshot): OfflineDbSnapshot {
  const filtered = filterSnapshotChildRows({
    santri: snapshot.santri as { id: string }[],
    kamar: snapshot.kamar as { id: string }[],
    absensi: snapshot.absensi,
    izin: snapshot.izin,
    pembinaan: snapshot.pembinaan,
    riwayat_kamar: snapshot.riwayat_kamar,
  });
  return { ...snapshot, ...filtered };
}

function resolveKegiatanId(
  kegiatanList: Record<string, unknown>[],
  label: string
): string | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const hit = kegiatanList.find((k) => String(k.nama ?? '').trim() === trimmed);
  return hit ? String(hit.id) : null;
}

function snapshotFromJsonBlob(parsed: Record<string, unknown>): OfflineDbSnapshot {
  return {
    santri: (parsed.santri as Record<string, unknown>[]) ?? [],
    kamar: (parsed.kamar as Record<string, unknown>[]) ?? [],
    kelas: (parsed.kelas as Record<string, unknown>[]) ?? [],
    kegiatan: (parsed.kegiatan as Record<string, unknown>[]) ?? [],
    penjadwalan: (parsed.penjadwalan as Record<string, unknown>[]) ?? [],
    penjadwalanPreset: (parsed.penjadwalanPreset as PenjadwalanPreset[]) ?? [],
    absensi: (parsed.absensi as Record<string, unknown>[]) ?? [],
    izin: (parsed.izin as Record<string, unknown>[]) ?? [],
    pembinaan: (parsed.pembinaan as Record<string, unknown>[]) ?? [],
    riwayat_kamar: (parsed.riwayat_kamar as SantriKamarRiwayatRow[]) ?? [],
    settings: (parsed.settings as AppSettings) ?? ({} as AppSettings),
  };
}

async function loadV2JsonTable<T>(table: string): Promise<T[]> {
  const db = await openConnection();
  const hasData = await tableHasColumn(table, 'data');
  if (!hasData) return [];
  const result = await db.query(`SELECT data FROM ${table}`);
  if (!result.values?.length) return [];
  return result.values.map((row) => JSON.parse((row as { data: string }).data) as T);
}

async function loadLegacyV2Snapshot(): Promise<OfflineDbSnapshot | null> {
  const settingsRaw = await getMeta('settings');
  if (!settingsRaw) return null;
  const [
    santri,
    kamar,
    kelas,
    kegiatan,
    penjadwalan,
    penjadwalanPreset,
    absensi,
    izin,
    pembinaan,
    riwayat_kamar,
  ] = await Promise.all([
    loadV2JsonTable<Record<string, unknown>>('santri'),
    loadV2JsonTable<Record<string, unknown>>('kamar'),
    loadV2JsonTable<Record<string, unknown>>('kelas'),
    loadV2JsonTable<Record<string, unknown>>('kegiatan'),
    loadV2JsonTable<Record<string, unknown>>('penjadwalan'),
    loadV2JsonTable<PenjadwalanPreset>('penjadwalan_preset'),
    loadV2JsonTable<Record<string, unknown>>('absensi'),
    loadV2JsonTable<Record<string, unknown>>('izin'),
    loadV2JsonTable<Record<string, unknown>>('pembinaan'),
    loadV2JsonTable<SantriKamarRiwayatRow>('riwayat_kamar'),
  ]);
  return {
    santri,
    kamar,
    kelas,
    kegiatan,
    penjadwalan,
    penjadwalanPreset,
    absensi,
    izin,
    pembinaan,
    riwayat_kamar,
    settings: JSON.parse(settingsRaw) as AppSettings,
  };
}

async function loadV3Snapshot(includeHeavy = true): Promise<OfflineDbSnapshot | null> {
  const settingsRaw = await getMeta('settings');
  if (!settingsRaw) return null;
  const db = await openConnection();

  const kamarRes = await db.query(`SELECT * FROM kamar`);
  const kamar = (kamarRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    let fasilitas: unknown[] = [];
    if (r.fasilitas_json) {
      try {
        fasilitas = JSON.parse(String(r.fasilitas_json)) as unknown[];
      } catch {
        fasilitas = [];
      }
    }
    return {
      id: r.id,
      nama: r.nama,
      kapasitas: r.kapasitas,
      lantai: r.lantai ?? '',
      ketua: r.ketua ?? '',
      fasilitas,
    };
  });

  const kamarNameById = new Map(kamar.map((k) => [String(k.id), String(k.nama)]));

  let santri: Record<string, unknown>[] = [];
  if (includeHeavy) {
  const santriRes = await db.query(
    `SELECT s.*, k.nama AS kamar_nama_join FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id`
  );
  santri = (santriRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const kamarNama =
      (r.kamar_nama_join as string) ||
      (r.kamar_id ? kamarNameById.get(String(r.kamar_id)) : '') ||
      '';
    return {
      id: r.id,
      nama: r.nama,
      kelas: r.kelas ?? '',
      kamar: kamarNama,
      kamar_id: r.kamar_id ?? undefined,
      nomor_wali: r.nomor_wali ?? '',
      jenis_kelamin: r.jenis_kelamin ?? '',
      include_wa: r.include_wa === 0 ? false : true,
      catatan: r.catatan ?? '',
      catatan_medis: r.catatan_medis ?? '',
      foto: r.foto ?? '',
      jumlah_pelanggaran: r.jumlah_pelanggaran ?? 0,
      masuk_kamar_sejak: r.masuk_kamar_sejak ?? undefined,
      asal_provinsi_code: r.asal_provinsi_code ?? undefined,
      asal_provinsi_nama: r.asal_provinsi_nama ?? undefined,
      asal_kota_code: r.asal_kota_code ?? undefined,
      asal_kota_nama: r.asal_kota_nama ?? undefined,
      asal_kecamatan_code: r.asal_kecamatan_code ?? undefined,
      asal_kecamatan_nama: r.asal_kecamatan_nama ?? undefined,
      asal_desa_code: r.asal_desa_code ?? undefined,
      asal_desa_nama: r.asal_desa_nama ?? undefined,
      created_at: r.created_at ?? undefined,
      updated_at: r.updated_at ?? undefined,
      created_by: r.created_by ?? undefined,
      updated_by: r.updated_by ?? undefined,
    };
  });
  }

  const kelasRes = await db.query(`SELECT * FROM kelas`);
  const kelas = (kelasRes.values ?? []) as Record<string, unknown>[];

  const kegiatanRes = await db.query(`SELECT * FROM kegiatan`);
  const kegiatan = (kegiatanRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const hari = r.hari_aktif_json ? JSON.parse(String(r.hari_aktif_json)) : [];
    return {
      id: r.id,
      nama: r.nama,
      jenis: r.jenis ?? '',
      icon: r.icon ? String(r.icon) : undefined,
      jam_mulai: r.jam_mulai ?? '',
      jam_selesai: r.jam_selesai ?? '',
      waktu: r.waktu ?? '',
      urutan: r.urutan ?? 0,
      untuk_absensi: r.untuk_absensi === 1,
      hari_aktif: hari,
    };
  });

  const presetRes = await db.query(`SELECT * FROM penjadwalan_preset`);
  const penjadwalanPreset = (presetRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      jenis: String(r.jenis),
      mode: r.mode as PenjadwalanPreset['mode'],
      mulai: String(r.mulai),
      bulanKeDepan: Number(r.bulan_ke_depan),
      gantiYangAda: r.ganti_yang_ada === 1,
      updatedAt: String(r.updated_at),
    };
  });

  let penjadwalan: Record<string, unknown>[] = [];
  let absensi: Record<string, unknown>[] = [];
  let izin: Record<string, unknown>[] = [];
  let pembinaan: Record<string, unknown>[] = [];
  let riwayat_kamar: SantriKamarRiwayatRow[] = [];

  if (includeHeavy) {
  const penjadwalanRes = await db.query(`SELECT * FROM penjadwalan`);
  penjadwalan = (penjadwalanRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      jenis: r.jenis,
      tanggal: r.tanggal,
      mode: r.mode,
      santri_id: r.santri_id ?? undefined,
      kamar_id: r.kamar_id ?? undefined,
      catatan: r.catatan ?? undefined,
    };
  });

  const absensiRes = await db.query(`SELECT * FROM absensi`);
  absensi = (absensiRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      santri_id: r.santri_id,
      kegiatan: r.kegiatan_label,
      kegiatan_id: r.kegiatan_id ?? undefined,
      tanggal: r.tanggal,
      status: r.status,
      catatan: r.catatan ?? undefined,
    };
  });

  const izinRes = await db.query(`SELECT * FROM izin`);
  izin = (izinRes.values ?? []) as Record<string, unknown>[];

  const pembinaanRes = await db.query(`SELECT * FROM pembinaan`);
  pembinaan = (pembinaanRes.values ?? []) as Record<string, unknown>[];

  const riwayatRes = await db.query(`SELECT * FROM riwayat_kamar`);
  riwayat_kamar = (riwayatRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      santri_id: String(r.santri_id),
      kamar_id: r.kamar_id ? String(r.kamar_id) : undefined,
      kamar_nama: String(r.kamar_nama),
      tipe: r.tipe as SantriKamarRiwayatRow['tipe'],
      tanggal: String(r.tanggal),
      kamar_sebelumnya: r.kamar_sebelumnya ? String(r.kamar_sebelumnya) : undefined,
    };
  });
  }

  return {
    santri,
    kamar,
    kelas,
    kegiatan,
    penjadwalan,
    penjadwalanPreset,
    absensi,
    izin,
    pembinaan,
    riwayat_kamar,
    settings: JSON.parse(settingsRaw) as AppSettings,
  };
}

async function loadV4Snapshot(includeHeavy = true): Promise<OfflineDbSnapshot | null> {
  const settingsRaw = await getMeta('settings');
  if (!settingsRaw) return null;
  const db = await openConnection();

  const kelasRes = await db.query(`SELECT * FROM kelas`);
  const kelas = (kelasRes.values ?? []) as Record<string, unknown>[];
  const kelasList = kelas.map((k) => ({
    id: String((k as { id: string }).id),
    nama: String((k as { nama?: string }).nama ?? ''),
  }));

  const kamarRes = await db.query(
    `SELECT k.*, s.nama AS ketua_nama FROM kamar k LEFT JOIN santri s ON s.id = k.ketua_santri_id`
  );
  const kamar = (kamarRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    let fasilitas: unknown[] = [];
    if (r.fasilitas_json) {
      try {
        fasilitas = JSON.parse(String(r.fasilitas_json)) as unknown[];
      } catch {
        fasilitas = [];
      }
    }
    return {
      id: r.id,
      nama: r.nama,
      kapasitas: r.kapasitas,
      lantai: r.lantai ?? '',
      ketua: r.ketua_nama ?? '',
      ketua_santri_id: r.ketua_santri_id ?? undefined,
      fasilitas,
      asrama_id: r.asrama_id ?? undefined,
      // Wajib ikut ekspor — tanpa ini push/delta sync kamar antar device putus.
      updated_at: r.updated_at ?? undefined,
      created_by: r.created_by ?? undefined,
      updated_by: r.updated_by ?? undefined,
    };
  });

  const kamarNameById = new Map(kamar.map((k) => [String(k.id), String(k.nama)]));

  let santri: Record<string, unknown>[] = [];
  if (includeHeavy) {
    const santriRes = await db.query(
      `SELECT s.*, k.nama AS kamar_nama_join, kl.nama AS kelas_nama_join
       FROM santri s
       LEFT JOIN kamar k ON k.id = s.kamar_id
       LEFT JOIN kelas kl ON kl.id = s.kelas_id`
    );
    santri = (santriRes.values ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const kamarNama =
        (r.kamar_nama_join as string) ||
        (r.kamar_id ? kamarNameById.get(String(r.kamar_id)) : '') ||
        '';
      const kelasNama =
        (r.kelas_nama_join as string) ||
        kelasNamaById(kelasList, r.kelas_id ? String(r.kelas_id) : null);
      return {
        id: r.id,
        nama: r.nama,
        kelas_id: r.kelas_id,
        kelas: kelasNama,
        kamar: kamarNama,
        kamar_id: r.kamar_id ?? undefined,
        nomor_wali: r.nomor_wali ?? '',
      jenis_kelamin: r.jenis_kelamin ?? '',
        include_wa: r.include_wa === 0 ? false : true,
        catatan: r.catatan ?? '',
        catatan_medis: r.catatan_medis ?? '',
        foto: r.foto ?? '',
        jumlah_pelanggaran: r.jumlah_pelanggaran ?? 0,
        masuk_kamar_sejak: r.masuk_kamar_sejak ?? undefined,
        asal_provinsi_code: r.asal_provinsi_code ?? undefined,
        asal_provinsi_nama: r.asal_provinsi_nama ?? undefined,
        asal_kota_code: r.asal_kota_code ?? undefined,
        asal_kota_nama: r.asal_kota_nama ?? undefined,
        asal_kecamatan_code: r.asal_kecamatan_code ?? undefined,
        asal_kecamatan_nama: r.asal_kecamatan_nama ?? undefined,
        asal_desa_code: r.asal_desa_code ?? undefined,
        asal_desa_nama: r.asal_desa_nama ?? undefined,
        created_at: r.created_at ?? undefined,
        updated_at: r.updated_at ?? undefined,
        created_by: r.created_by ?? undefined,
        updated_by: r.updated_by ?? undefined,
        asrama_id: r.asrama_id ?? undefined,
      };
    });
  }

  const kegiatanRes = await db.query(`SELECT * FROM kegiatan`);
  const kegiatan = (kegiatanRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const hari = r.hari_aktif_json ? JSON.parse(String(r.hari_aktif_json)) : [];
    return {
      id: r.id,
      nama: r.nama,
      jenis: r.jenis ?? '',
      icon: r.icon ? String(r.icon) : undefined,
      jam_mulai: r.jam_mulai ?? '',
      jam_selesai: r.jam_selesai ?? '',
      waktu: r.waktu ?? '',
      urutan: r.urutan ?? 0,
      untuk_absensi: r.untuk_absensi === 1,
      hari_aktif: hari,
    };
  });

  const presetRes = await db.query(`SELECT * FROM penjadwalan_preset`);
  const penjadwalanPreset = (presetRes.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      jenis: String(r.jenis),
      mode: r.mode as PenjadwalanPreset['mode'],
      mulai: String(r.mulai),
      bulanKeDepan: Number(r.bulan_ke_depan),
      gantiYangAda: false,
      updatedAt: String(r.updated_at),
    };
  });

  let penjadwalan: Record<string, unknown>[] = [];
  let absensi: Record<string, unknown>[] = [];
  let izin: Record<string, unknown>[] = [];
  let pembinaan: Record<string, unknown>[] = [];
  let riwayat_kamar: SantriKamarRiwayatRow[] = [];

  if (includeHeavy) {
    const penjadwalanRes = await db.query(`SELECT * FROM penjadwalan ORDER BY tanggal`);
    penjadwalan = (penjadwalanRes.values ?? []).map((row) => {
      const entry = penjadwalanRowToEntry(row as Record<string, unknown>);
      return { ...entry };
    });

    const absensiRes = await db.query(
      `SELECT a.*, g.nama AS kegiatan_nama FROM absensi a
       LEFT JOIN kegiatan g ON g.id = a.kegiatan_id`
    );
    absensi = (absensiRes.values ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id,
        santri_id: r.santri_id,
        kegiatan: r.kegiatan_nama ?? '',
        kegiatan_id: r.kegiatan_id,
        tanggal: r.tanggal,
        status: r.status,
        catatan: r.catatan ?? undefined,
      };
    });

    const izinRes = await db.query(`SELECT * FROM izin`);
    izin = (izinRes.values ?? []) as Record<string, unknown>[];

    const pembinaanRes = await db.query(`SELECT * FROM pembinaan`);
    pembinaan = (pembinaanRes.values ?? []) as Record<string, unknown>[];

    const riwayatRes = await db.query(`SELECT * FROM riwayat_kamar`);
    riwayat_kamar = (riwayatRes.values ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: String(r.id),
        santri_id: String(r.santri_id),
        kamar_id: r.kamar_id ? String(r.kamar_id) : undefined,
        kamar_nama: String(r.kamar_nama),
        tipe: r.tipe as SantriKamarRiwayatRow['tipe'],
        tanggal: String(r.tanggal),
        kamar_sebelumnya_id: r.kamar_sebelumnya_id ? String(r.kamar_sebelumnya_id) : undefined,
        kamar_sebelumnya_nama: r.kamar_sebelumnya_nama
          ? String(r.kamar_sebelumnya_nama)
          : undefined,
        kamar_sebelumnya: r.kamar_sebelumnya_nama
          ? String(r.kamar_sebelumnya_nama)
          : r.kamar_sebelumnya
            ? String(r.kamar_sebelumnya)
            : undefined,
      };
    });
  }

  return {
    santri,
    kamar,
    kelas,
    kegiatan,
    penjadwalan,
    penjadwalanPreset,
    absensi,
    izin,
    pembinaan,
    riwayat_kamar,
    settings: JSON.parse(settingsRaw) as AppSettings,
  };
}

async function rebuildSchemaAndPersist(snapshot: OfflineDbSnapshot): Promise<void> {
  const v4 = transformOfflineSnapshotToV4(snapshot);
  await runSqlWrite(async () => {
    const db = await openConnection();
    await db.execute('PRAGMA foreign_keys = OFF;');
    await db.execute(DROP_ENTITY_TABLES_V4_SQL);
    await db.execute('PRAGMA foreign_keys = ON;');
    await createEntitySchemaV4();
    await writeSnapshotV4Inner(v4);
    await db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
      'schema_version',
      String(SCHEMA_VERSION),
    ]);
  });
}

export type SqlEntity =
  | 'settings'
  | 'kamar'
  | 'kelas'
  | 'kegiatan'
  | 'santri'
  | 'penjadwalanPreset'
  | 'penjadwalan'
  | 'absensi'
  | 'izin'
  | 'pembinaan'
  | 'riwayat_kamar';

export const SQL_ENTITIES_ALL: SqlEntity[] = [
  'kamar',
  'kelas',
  'kegiatan',
  'santri',
  'penjadwalanPreset',
  'penjadwalan',
  'absensi',
  'izin',
  'pembinaan',
  'riwayat_kamar',
  'settings',
];

const SQL_FLUSH_ORDER: SqlEntity[] = SQL_ENTITIES_ALL;

/** Baris izin/BK/absensi yang santri_id-nya sudah tidak ada (sisa hapus lama). */
async function purgeOrphanSantriChildRows(db: SQLiteDBConnection): Promise<void> {
  const childTables = ['absensi', 'izin', 'pembinaan', 'riwayat_kamar', 'tagihan', 'pembayaran'] as const;
  for (const table of childTables) {
    await db.run(
      `DELETE FROM ${table} WHERE santri_id IS NOT NULL AND santri_id NOT IN (SELECT id FROM santri)`
    );
  }
}

const SYNC_META_SQL = `
  CREATE TABLE IF NOT EXISTS sync_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sync_tombstone (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (table_name, row_id)
  );
`;

const AUDIT_TABLES = [
  'kelas',
  'kamar',
  'kegiatan',
  'santri',
  'penjadwalan_preset',
  'penjadwalan',
  'absensi',
  'izin',
  'pembinaan',
  'riwayat_kamar',
] as const;

const AUDIT_BY_ENTITY: Record<string, string> = {
  kelas: 'kelas',
  kamar: 'kamar',
  kegiatan: 'kegiatan',
  santri: 'santri',
  penjadwalanPreset: 'penjadwalan_preset',
  penjadwalan: 'penjadwalan',
  absensi: 'absensi',
  izin: 'izin',
  pembinaan: 'pembinaan',
  riwayat_kamar: 'riwayat_kamar',
};

const UPDATED_AT_TABLES = [
  'kelas',
  'kegiatan',
  'kamar',
  'santri',
  'penjadwalan',
  'penjadwalan_preset',
  'absensi',
  'izin',
  'pembinaan',
  'riwayat_kamar',
] as const;

async function ensureSchemaPatches(): Promise<void> {
  const db = await openConnection();
  if (!(await tableHasColumn('kamar', 'fasilitas_json'))) {
    await db.execute(`ALTER TABLE kamar ADD COLUMN fasilitas_json TEXT`);
  }
  if (!(await tableHasColumn('kegiatan', 'icon'))) {
    await db.execute(`ALTER TABLE kegiatan ADD COLUMN icon TEXT`);
  }
  if (!(await tableHasColumn('kamar', 'asrama_id'))) {
    await db.execute(`ALTER TABLE kamar ADD COLUMN asrama_id TEXT`);
  }
  if (!(await tableHasColumn('santri', 'asrama_id'))) {
    await db.execute(`ALTER TABLE santri ADD COLUMN asrama_id TEXT`);
  }
  if (!(await tableHasColumn('santri', 'jenis_kelamin'))) {
    await db.execute(`ALTER TABLE santri ADD COLUMN jenis_kelamin TEXT`);
  }
  for (const table of AUDIT_TABLES) {
    if (!(await tableHasColumn(table, 'created_by'))) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN created_by TEXT`);
    }
    if (!(await tableHasColumn(table, 'updated_by'))) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN updated_by TEXT`);
    }
  }
  await db.execute(SYNC_META_SQL);
  for (const table of UPDATED_AT_TABLES) {
    if (!(await tableHasColumn(table, 'updated_at'))) {
      await db.execute(
        `ALTER TABLE ${table} ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`
      );
    }
  }
  await purgeOrphanSantriChildRows(db);
}

const WEB_TOMBSTONE_KEY = 'asrama_sync_tombstones';

type WebTombstone = { table_name: string; row_id: string; deleted_at: string };

function readWebTombstones(): WebTombstone[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WEB_TOMBSTONE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WebTombstone[]) : [];
  } catch {
    return [];
  }
}

function writeWebTombstones(rows: WebTombstone[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(WEB_TOMBSTONE_KEY, JSON.stringify(rows));
  } catch {
    /* ignore quota */
  }
}

function upsertWebTombstone(tableName: string, rowId: string): void {
  const deletedAt = new Date().toISOString();
  const rows = readWebTombstones().filter(
    (r) => !(r.table_name === tableName && r.row_id === rowId)
  );
  rows.push({ table_name: tableName, row_id: rowId, deleted_at: deletedAt });
  writeWebTombstones(rows);
}

export async function recordSyncTombstone(tableName: string, rowId: string): Promise<void> {
  if (!tableName || !rowId) return;
  // Full-online Turso / web: simpan tombstone di localStorage agar push bisa hapus baris cloud.
  if (!shouldPersistToSqlite()) {
    upsertWebTombstone(tableName, rowId);
    return;
  }
  await initOfflineSqlite();
  await runSqlExclusive(async (db) => {
    await db.run(
      `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [tableName, rowId]
    );
  });
}

export async function recordSyncTombstones(
  tableName: string,
  rowIds: string[]
): Promise<void> {
  if (!rowIds.length) return;
  if (!shouldPersistToSqlite()) {
    for (const rowId of rowIds) {
      if (!rowId) continue;
      upsertWebTombstone(tableName, rowId);
    }
    return;
  }
  await initOfflineSqlite();
  await runSqlExclusive(async (db) => {
    for (const rowId of rowIds) {
      if (!rowId) continue;
      await db.run(
        `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
        [tableName, rowId]
      );
    }
  });
}

export async function listSyncTombstones(): Promise<
  { table_name: string; row_id: string; deleted_at: string }[]
> {
  if (!shouldPersistToSqlite()) {
    return readWebTombstones().map((r) => ({
      table_name: String(r.table_name),
      row_id: String(r.row_id),
      deleted_at: String(r.deleted_at),
    }));
  }
  await initOfflineSqlite();
  return runSqlExclusive(async (db) => {
    const result = await db.query(
      `SELECT table_name, row_id, deleted_at FROM sync_tombstone`
    );
    return (result.values ?? []).map((r) => {
      const row = r as { table_name: string; row_id: string; deleted_at: string };
      return {
        table_name: String(row.table_name),
        row_id: String(row.row_id),
        deleted_at: String(row.deleted_at),
      };
    });
  });
}

/** Hapus tombstone lokal setelah berhasil diterapkan ke Turso. */
export async function clearAppliedTombstones(
  tombstones: { table_name: string; row_id: string }[]
): Promise<void> {
  if (!tombstones.length) return;
  if (!shouldPersistToSqlite()) {
    const drop = new Set(tombstones.map((t) => `${t.table_name}|${t.row_id}`));
    writeWebTombstones(
      readWebTombstones().filter((r) => !drop.has(`${r.table_name}|${r.row_id}`))
    );
    return;
  }
  await initOfflineSqlite();
  await runSqlExclusive(async (db) => {
    for (const t of tombstones) {
      await db.run(`DELETE FROM sync_tombstone WHERE table_name = ? AND row_id = ?`, [
        t.table_name,
        t.row_id,
      ]);
    }
  });
}

export async function touchUpdatedAt(tableName: string, rowId?: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await runSqlExclusive(async (db) => {
    if (rowId) {
      await db.run(`UPDATE ${tableName} SET updated_at = datetime('now') WHERE id = ?`, [rowId]);
    } else {
      await db.run(`UPDATE ${tableName} SET updated_at = datetime('now')`);
    }
  });
}

const WEB_SYNC_META_PREFIX = 'asrama_sync_meta:';

export async function getSyncMeta(key: string): Promise<string | null> {
  if (!shouldPersistToSqlite()) {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(`${WEB_SYNC_META_PREFIX}${key}`);
  }
  return runSqlExclusive(async (db) => {
    const result = await db.query(`SELECT value FROM sync_meta WHERE key = ?`, [key]);
    if (result.values?.length) {
      return String((result.values[0] as { value: string }).value);
    }
    return null;
  });
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  if (!shouldPersistToSqlite()) {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`${WEB_SYNC_META_PREFIX}${key}`, value);
    return;
  }
  await runSqlExclusive(async (db) => {
    await db.run(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`, [key, value]);
  });
}

/** Terapkan settings hasil pull (tanpa replace seluruh snapshot). */
export async function applyRemoteAppSettings(settings: AppSettings): Promise<void> {
  if (!shouldPersistToSqlite()) {
    await setSyncMeta('settings_updated_at', new Date().toISOString());
    return;
  }
  await runSqlExclusive(async (db) => {
    await db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
      'settings',
      JSON.stringify(settings),
    ]);
    await db.run(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`, [
      'settings_updated_at',
      new Date().toISOString(),
    ]);
  });
}

async function flushKamarTable(db: SQLiteDBConnection, kamar: Record<string, unknown>[]) {
  const snapshotIds = new Set(kamar.map((row) => String(row.id)));
  const existingRes = await db.query(`SELECT id FROM kamar`);
  const existingIds = (existingRes.values ?? []).map((r) =>
    String((r as { id: string }).id)
  );

  for (const row of kamar) {
    const kamarId = String(row.id);
    const ketuaName = row.ketua ? String(row.ketua).trim() : '';
    let ketuaId: string | null = null;
    if (ketuaName) {
      if (row.ketua_santri_id) {
        const sid = String(row.ketua_santri_id);
        const ok = (
          await db.query(`SELECT id FROM santri WHERE id = ? AND kamar_id = ?`, [sid, kamarId])
        ).values?.length;
        if (ok) ketuaId = sid;
      }
      if (!ketuaId) {
        const hit = (
          await db.query(`SELECT id FROM santri WHERE trim(nama) = ? AND kamar_id = ?`, [
            ketuaName,
            kamarId,
          ])
        ).values?.[0] as { id?: string } | undefined;
        if (hit?.id) ketuaId = String(hit.id);
      }
    }
    await db.run(
      `INSERT INTO kamar (id, nama, kapasitas, lantai, ketua_santri_id, fasilitas_json, asrama_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         nama=excluded.nama,
         kapasitas=excluded.kapasitas,
         lantai=excluded.lantai,
         ketua_santri_id=excluded.ketua_santri_id,
         fasilitas_json=excluded.fasilitas_json,
         asrama_id=excluded.asrama_id,
         updated_at=datetime('now')`,
      [
        String(row.id),
        strField(row, 'nama'),
        Number(row.kapasitas) || 4,
        optStr(row, 'lantai'),
        ketuaId,
        JSON.stringify(row.fasilitas ?? []),
        optStr(row, 'asrama_id'),
      ]
    );
  }

  for (const id of existingIds) {
    if (snapshotIds.has(id)) continue;
    await db.run(
      `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES ('kamar', ?, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [id]
    );
    await db.run(`UPDATE kamar SET ketua_santri_id = NULL WHERE id = ?`, [id]);
    await db.run(`UPDATE santri SET kamar_id = NULL, masuk_kamar_sejak = NULL WHERE kamar_id = ?`, [
      id,
    ]);
    await db.run(`UPDATE riwayat_kamar SET kamar_id = NULL WHERE kamar_id = ?`, [id]);
    await db.run(`DELETE FROM kamar WHERE id = ?`, [id]);
  }
}

async function flushKelasTable(db: SQLiteDBConnection, kelas: Record<string, unknown>[]) {
  const nextIds = new Set(kelas.map((row) => String(row.id)));
  const existingRes = await db.query(`SELECT id FROM kelas`);
  for (const row of existingRes.values ?? []) {
    const id = String((row as { id: string }).id);
    if (nextIds.has(id)) continue;
    await db.run(
      `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES ('kelas', ?, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [id]
    );
  }
  await db.run(`DELETE FROM kelas`);
  for (const row of kelas) {
    await db.run(
      `INSERT INTO kelas (id, nama, tingkat, updated_at) VALUES (?, ?, ?, datetime('now'))`,
      [String(row.id), strField(row, 'nama'), optStr(row, 'tingkat')]
    );
  }
}

async function flushKegiatanTable(db: SQLiteDBConnection, kegiatan: Record<string, unknown>[]) {
  const nextIds = new Set(kegiatan.map((row) => String(row.id)));
  const existingRes = await db.query(`SELECT id FROM kegiatan`);
  for (const row of existingRes.values ?? []) {
    const id = String((row as { id: string }).id);
    if (nextIds.has(id)) continue;
    await db.run(
      `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES ('kegiatan', ?, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [id]
    );
  }
  await db.run(`DELETE FROM kegiatan`);
  for (const row of kegiatan) {
    await db.run(
      `INSERT INTO kegiatan (id, nama, jenis, icon, jam_mulai, jam_selesai, waktu, urutan, untuk_absensi, hari_aktif_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        String(row.id),
        strField(row, 'nama'),
        optStr(row, 'jenis'),
        optStr(row, 'icon'),
        optStr(row, 'jam_mulai'),
        optStr(row, 'jam_selesai'),
        optStr(row, 'waktu'),
        Number(row.urutan) || 0,
        row.untuk_absensi === false ? 0 : 1,
        JSON.stringify(row.hari_aktif ?? []),
      ]
    );
  }
}

async function flushSantriTable(
  db: SQLiteDBConnection,
  santri: Record<string, unknown>[],
  kamar: Record<string, unknown>[],
  kelas: Record<string, unknown>[]
) {
  const kelasList = kelas.map((k) => ({
    id: String(k.id),
    nama: String(k.nama ?? ''),
    tingkat: k.tingkat ? String(k.tingkat) : undefined,
  }));
  const fallbackId = kelasList[0]?.id ?? '';
  const nextIds = new Set(santri.map((row) => String(row.id)));
  const existingRes = await db.query(`SELECT id FROM santri`);
  for (const er of existingRes.values ?? []) {
    const id = String((er as { id: string }).id);
    if (nextIds.has(id)) continue;
    await db.run(
      `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES ('santri', ?, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [id]
    );
  }
  await db.run(`DELETE FROM santri`);
  for (const row of santri) {
    const resolved = resolveKamarId(kamar, strField(row, 'kamar'));
    const kamarId =
      resolved && kamar.some((k) => String(k.id) === resolved) ? resolved : null;
    const kelasId =
      resolveKelasId(kelasList, row.kelas_id) ??
      resolveKelasId(kelasList, row.kelas) ??
      fallbackId;
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO santri (
        id, nama, kelas_id, kamar_id, nomor_wali, jenis_kelamin, include_wa, catatan, catatan_medis, foto,
        jumlah_pelanggaran, masuk_kamar_sejak,
        asal_provinsi_code, asal_provinsi_nama, asal_kota_code, asal_kota_nama,
        asal_kecamatan_code, asal_kecamatan_nama, asal_desa_code, asal_desa_nama,
        asrama_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(row.id),
        strField(row, 'nama'),
        kelasId,
        kamarId,
        optStr(row, 'nomor_wali'),
        optStr(row, 'jenis_kelamin'),
        boolToInt(row, 'include_wa'),
        optStr(row, 'catatan'),
        optStr(row, 'catatan_medis'),
        optStr(row, 'foto'),
        Number(row.jumlah_pelanggaran) || 0,
        optStr(row, 'masuk_kamar_sejak'),
        optStr(row, 'asal_provinsi_code'),
        optStr(row, 'asal_provinsi_nama'),
        optStr(row, 'asal_kota_code'),
        optStr(row, 'asal_kota_nama'),
        optStr(row, 'asal_kecamatan_code'),
        optStr(row, 'asal_kecamatan_nama'),
        optStr(row, 'asal_desa_code'),
        optStr(row, 'asal_desa_nama'),
        optStr(row, 'asrama_id'),
        optStr(row, 'created_at') ?? now,
        optStr(row, 'updated_at') ?? now,
      ]
    );
  }
}

async function tombstoneMissing(
  db: SQLiteDBConnection,
  tableName: string,
  nextIds: Set<string>
): Promise<void> {
  const existingRes = await db.query(`SELECT id FROM ${tableName}`);
  for (const er of existingRes.values ?? []) {
    const id = String((er as { id: string }).id);
    if (nextIds.has(id)) continue;
    await db.run(
      `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [tableName, id]
    );
  }
}

async function flushPenjadwalanPresetTable(
  db: SQLiteDBConnection,
  presets: PenjadwalanPreset[]
) {
  await tombstoneMissing(
    db,
    'penjadwalan_preset',
    new Set(presets.map((p) => p.id))
  );
  await db.run(`DELETE FROM penjadwalan_preset`);
  for (const p of presets) {
    await db.run(
      `INSERT INTO penjadwalan_preset (id, jenis, mode, mulai, bulan_ke_depan, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [p.id, p.jenis, p.mode, p.mulai, p.bulanKeDepan, p.updatedAt || new Date().toISOString()]
    );
  }
}

async function flushPenjadwalanTable(db: SQLiteDBConnection, rows: Record<string, unknown>[]) {
  const entries = rows
    .map((row) => penjadwalanRowToEntry(row))
    .filter((entry) => entry.assignee_nama && entry.assignee_nama !== '-');
  await tombstoneMissing(db, 'penjadwalan', new Set(entries.map((e) => e.id)));
  await db.run(`DELETE FROM penjadwalan`);
  for (const entry of entries) {
    const params = penjadwalanInsertParams(entry);
    await db.run(
      `INSERT OR IGNORE INTO penjadwalan (
        id, jenis, tanggal, mode,
        assignee_santri_id, assignee_kamar_id, assignee_nama, assignee_detail,
        catatan, generated_at, generate_batch_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      params
    );
  }
}

async function flushAbsensiTable(
  db: SQLiteDBConnection,
  rows: Record<string, unknown>[],
  kegiatan: Record<string, unknown>[]
) {
  const prepared: { id: string; values: unknown[] }[] = [];
  for (const row of rows) {
    const label = strField(row, 'kegiatan');
    const kegiatanId =
      row.kegiatan_id ? String(row.kegiatan_id) : resolveKegiatanId(kegiatan, label);
    if (!kegiatanId) continue;
    const tanggal = normalizeDateKey(row.tanggal);
    prepared.push({
      id: String(row.id),
      values: [
        String(row.id),
        strField(row, 'santri_id'),
        kegiatanId,
        tanggal,
        strField(row, 'status'),
        optStr(row, 'catatan'),
      ],
    });
  }
  await tombstoneMissing(db, 'absensi', new Set(prepared.map((p) => p.id)));
  await db.run(`DELETE FROM absensi`);
  for (const p of prepared) {
    await db.run(
      `INSERT OR IGNORE INTO absensi (id, santri_id, kegiatan_id, tanggal, status, catatan, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      p.values
    );
  }
}

async function flushIzinTable(db: SQLiteDBConnection, rows: Record<string, unknown>[]) {
  await tombstoneMissing(db, 'izin', new Set(rows.map((r) => String(r.id))));
  await db.run(`DELETE FROM izin`);
  for (const row of rows) {
    await db.run(
      `INSERT INTO izin (id, santri_id, alasan, tanggal_keluar, batas_kembali, status_kembali, penjemput, waktu_kembali_aktual, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        String(row.id),
        strField(row, 'santri_id'),
        strField(row, 'alasan'),
        strField(row, 'tanggal_keluar'),
        strField(row, 'batas_kembali'),
        strField(row, 'status_kembali'),
        optStr(row, 'penjemput'),
        optStr(row, 'waktu_kembali_aktual'),
        optStr(row, 'created_at') ?? new Date().toISOString(),
      ]
    );
  }
}

async function flushPembinaanTable(db: SQLiteDBConnection, rows: Record<string, unknown>[]) {
  await tombstoneMissing(db, 'pembinaan', new Set(rows.map((r) => String(r.id))));
  await db.run(`DELETE FROM pembinaan`);
  for (const row of rows) {
    await db.run(
      `INSERT INTO pembinaan (id, santri_id, jenis, keterangan, tanggal, tindak_lanjut, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        String(row.id),
        strField(row, 'santri_id'),
        strField(row, 'jenis'),
        strField(row, 'keterangan'),
        strField(row, 'tanggal'),
        optStr(row, 'tindak_lanjut'),
        optStr(row, 'created_at') ?? new Date().toISOString(),
      ]
    );
  }
}

async function flushRiwayatKamarTable(
  db: SQLiteDBConnection,
  rows: SantriKamarRiwayatRow[],
  kamar: Record<string, unknown>[]
) {
  await tombstoneMissing(db, 'riwayat_kamar', new Set(rows.map((r) => r.id)));
  await db.run(`DELETE FROM riwayat_kamar`);
  for (const row of rows) {
    const kamarId = coerceKamarForeignKeyId(
      kamar as { id: string; nama?: string }[],
      row.kamar_nama,
      row.kamar_id
    );
    const { prevId, prevNama } = resolveRiwayatKamarSebelumnyaFields(
      row,
      kamar as { id: string; nama?: string }[]
    );
    const v4 = await tableHasColumn('riwayat_kamar', 'kamar_sebelumnya_id');
    if (!v4) {
      const { prevLegacy } = resolveRiwayatKamarSebelumnyaFields(
        row,
        kamar as { id: string; nama?: string }[]
      );
      await db.run(
        `INSERT INTO riwayat_kamar (id, santri_id, kamar_id, kamar_nama, tipe, tanggal, kamar_sebelumnya) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.santri_id,
          kamarId,
          row.kamar_nama,
          row.tipe,
          row.tanggal,
          prevLegacy,
        ]
      );
      continue;
    }
    await db.run(
      `INSERT INTO riwayat_kamar (id, santri_id, kamar_id, kamar_nama, kamar_sebelumnya_id, kamar_sebelumnya_nama, tipe, tanggal, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        row.id,
        row.santri_id,
        kamarId,
        row.kamar_nama,
        prevId,
        prevNama,
        row.tipe,
        row.tanggal,
      ]
    );
  }
}

async function flushSettingsMeta(db: SQLiteDBConnection, settings: AppSettings) {
  await db.run(`INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)`, [
    'settings_updated_at',
    new Date().toISOString(),
  ]);
  await db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
    'settings',
    JSON.stringify(settings),
  ]);
}

/** Tabel yang tidak di-flush dari RAM kosong/sebagian di APK (pakai sql-entity-io). */
export const SQL_HEAVY_ENTITIES: SqlEntity[] = [
  'santri',
  'penjadwalan',
  'absensi',
  'izin',
  'pembinaan',
  'riwayat_kamar',
];

async function commitSqlTablesCore(
  snapshot: OfflineDbSnapshot,
  tables: SqlEntity[],
  opts?: { fullHeavyFlush?: boolean }
): Promise<void> {
  await initOfflineSqlite();
  const safe = sanitizeSnapshotForForeignKeys(snapshot);
  const db = await openConnection();
  const selected = new Set(tables);
  const fullHeavy = opts?.fullHeavyFlush === true;

  await db.execute('PRAGMA foreign_keys = OFF;', false);
  try {
    for (const entity of SQL_FLUSH_ORDER) {
      if (!selected.has(entity)) continue;
      if (!fullHeavy && SQL_HEAVY_ENTITIES.includes(entity)) continue;
      switch (entity) {
        case 'kamar':
          await flushKamarTable(db, safe.kamar);
          break;
        case 'kelas':
          await flushKelasTable(db, safe.kelas);
          break;
        case 'kegiatan':
          await flushKegiatanTable(db, safe.kegiatan);
          break;
        case 'santri':
          await flushSantriTable(db, safe.santri, safe.kamar, safe.kelas);
          break;
        case 'penjadwalanPreset':
          await flushPenjadwalanPresetTable(db, safe.penjadwalanPreset);
          break;
        case 'penjadwalan':
          await flushPenjadwalanTable(db, safe.penjadwalan);
          break;
        case 'absensi':
          await flushAbsensiTable(db, safe.absensi, safe.kegiatan);
          break;
        case 'izin':
          await flushIzinTable(db, safe.izin);
          break;
        case 'pembinaan':
          await flushPembinaanTable(db, safe.pembinaan);
          break;
        case 'riwayat_kamar':
          await flushRiwayatKamarTable(db, safe.riwayat_kamar, safe.kamar);
          break;
        case 'settings':
          await flushSettingsMeta(db, safe.settings);
          break;
      }
    }
    // Stempel audit: isi created_by/updated_by untuk baris yang belum punya.
    const actor = currentActorName();
    if (actor) {
      for (const [entity, table] of Object.entries(AUDIT_BY_ENTITY)) {
        if (!selected.has(entity as SqlEntity)) continue;
        await db.run(
          `UPDATE ${table} SET created_by = COALESCE(created_by, ?), updated_by = COALESCE(updated_by, ?)`,
          [actor, actor]
        );
      }
    }
    await db.execute('PRAGMA foreign_keys = ON;', false);
  } catch (err) {
    try {
      await db.execute('PRAGMA foreign_keys = ON;', false);
    } catch {
      /* best effort */
    }
    throw err;
  }
}

/** Sinkronkan hanya tabel yang berubah (pola repository / unit of work). */
export async function commitSqlTables(
  snapshot: OfflineDbSnapshot,
  tables: SqlEntity[],
  opts?: { fullHeavyFlush?: boolean }
): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await runSqlWrite(() => commitSqlTablesCore(snapshot, tables, opts));
}

/** Hapus santri + semua baris terkait (eksplisit — tidak mengandalkan CASCADE di DB lama). */
export async function sqlDeleteSantriCascade(santriId: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await runSqlWrite(async () => {
    await initOfflineSqlite();
    const db = await openConnection();
    await db.execute('PRAGMA foreign_keys = ON;');
    const childTables = ['absensi', 'izin', 'pembinaan', 'riwayat_kamar'] as const;
    for (const table of childTables) {
      const existing = await db.query(`SELECT id FROM ${table} WHERE santri_id = ?`, [santriId]);
      for (const row of existing.values ?? []) {
        const id = String((row as { id: string }).id);
        await db.run(
          `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
          [table, id]
        );
      }
      await db.run(`DELETE FROM ${table} WHERE santri_id = ?`, [santriId]);
    }
    await db.run(`UPDATE kamar SET ketua_santri_id = NULL WHERE ketua_santri_id = ?`, [santriId]);
    await db.run(
      `INSERT INTO sync_tombstone (table_name, row_id, deleted_at) VALUES ('santri', ?, datetime('now'))
       ON CONFLICT(table_name, row_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [santriId]
    );
    await db.run(`DELETE FROM santri WHERE id = ?`, [santriId]);
  });
}

async function writeSnapshotV4Inner(snapshot: OfflineDbSnapshot): Promise<void> {
  const v4 = transformOfflineSnapshotToV4(snapshot);
  await commitSqlTablesCore(v4, SQL_ENTITIES_ALL, { fullHeavyFlush: true });
}

async function writeSnapshotV4(snapshot: OfflineDbSnapshot): Promise<void> {
  const db = await openConnection();
  await db.execute('PRAGMA foreign_keys = OFF;');
  await db.execute(DROP_ENTITY_TABLES_V4_SQL);
  await db.execute('PRAGMA foreign_keys = ON;');
  await createEntitySchemaV4();
  await ensureSchemaPatches();
  await writeSnapshotV4Inner(snapshot);
}

async function bumpSchemaVersionToCurrent(): Promise<void> {
  await runSqlWrite(async () => {
    const db = await openConnection();
    await db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
      'schema_version',
      String(SCHEMA_VERSION),
    ]);
  });
}

async function migrateSchemaIfNeeded(): Promise<void> {
  const version = await getMeta('schema_version');
  if (version === String(SCHEMA_VERSION)) {
    await createEntitySchemaV4();
    await ensureSchemaPatches();
    return;
  }

  let snapshot: OfflineDbSnapshot | null = null;

  const legacyKv = await readLegacyKvBlob();
  if (legacyKv) {
    snapshot = snapshotFromJsonBlob(JSON.parse(legacyKv) as Record<string, unknown>);
    await deleteLegacyKvBlob();
  } else if (version === '2' || (await tableHasColumn('santri', 'data'))) {
    snapshot = await loadLegacyV2Snapshot();
  } else if (
    version === '3' ||
    (await tableHasColumn('penjadwalan', 'santri_id')) ||
    (await tableHasColumn('santri', 'kelas'))
  ) {
    if (version === '3') {
      await createEntitySchemaV4();
      await ensureSchemaPatches();
      await bumpSchemaVersionToCurrent();
      return;
    }
    snapshot = await loadV3Snapshot(false);
  }

  if (snapshot) {
    await rebuildSchemaAndPersist(snapshot);
    return;
  }

  await createEntitySchemaV4();
  await ensureSchemaPatches();
}

export async function initOfflineSqlite(): Promise<void> {
  if (!shouldPersistToSqlite() || schemaReady) return;
  await ensureMetaTables();
  await migrateSchemaIfNeeded();
  await ensureSchemaPatches();
  schemaReady = true;
}

/** Muat inti (tanpa santri/absensi/izin/…) — untuk APK skala besar. */
export async function loadOfflineDbCoreSnapshot(): Promise<OfflineDbSnapshot | null> {
  if (!shouldPersistToSqlite()) return null;
  await initOfflineSqlite();
  const version = await getMeta('schema_version');
  if (version !== String(SCHEMA_VERSION)) return null;
  return loadV4Snapshot(false);
}

/** Muat penuh dari SQLite; `null` jika belum ada data (perlu seed). */
export async function loadOfflineDbSnapshot(): Promise<OfflineDbSnapshot | null> {
  if (!shouldPersistToSqlite()) return null;
  await initOfflineSqlite();

  const version = await getMeta('schema_version');
  if (version !== String(SCHEMA_VERSION)) {
    return null;
  }

  return loadV4Snapshot(true);
}

export async function saveOfflineDbSnapshot(snapshot: OfflineDbSnapshot): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await initOfflineSqlite();
  await commitSqlTables(snapshot, SQL_ENTITIES_ALL, { fullHeavyFlush: true });
  const db = await openConnection();
  await db.run(`INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`, [
    'schema_version',
    String(SCHEMA_VERSION),
  ]);
}

/** Ganti seluruh isi DB (drop + tulis ulang) — untuk hapus data, impor, reset awal. */
export async function replaceOfflineDbSnapshot(snapshot: OfflineDbSnapshot): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await runSqlWrite(async () => {
    await initOfflineSqlite();
    await writeSnapshotV4(snapshot);
  });
}

export async function importLegacyLocalStorageJson(raw: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  const snapshot = snapshotFromJsonBlob(JSON.parse(raw) as Record<string, unknown>);
  await rebuildSchemaAndPersist(snapshot);
}
