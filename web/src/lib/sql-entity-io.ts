import type { PenjadwalanEntry } from './penjadwalan';
import { currentActorName } from './app-auth';
import {
  resolveRiwayatKamarSebelumnyaFields,
  type SantriKamarRiwayatRow,
} from './santri-kamar-riwayat';
import {
  initOfflineSqlite,
  loadOfflineDbSnapshot,
  recordSyncTombstone,
  runSqlExclusive,
  shouldPersistToSqlite,
} from './offline-db';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';
import { SqlForeignKeyError, coerceKamarForeignKeyId } from './sqlite-fk';
import { resolveKelasId } from './db/kelas-resolve';
import { normalizeDateKey } from './db/date-normalize';
import { penjadwalanRowToEntry, penjadwalanInsertParams } from './db/penjadwalan-storage';

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

function resolveKegiatanId(kegiatan: Record<string, unknown>[], label: string): string | null {
  const hit = kegiatan.find((k) => String(k.nama ?? '') === label);
  return hit ? String(hit.id) : null;
}

async function conn(): Promise<SQLiteDBConnection> {
  return withSql(async (db) => db);
}

async function withSql<T>(fn: (db: SQLiteDBConnection) => Promise<T>): Promise<T> {
  await initOfflineSqlite();
  return runSqlExclusive(fn);
}

async function withWrite<T>(fn: (db: SQLiteDBConnection) => Promise<T>): Promise<T> {
  return withSql(fn);
}

async function sqlIdSetOnDb(
  db: SQLiteDBConnection,
  table: 'santri' | 'kamar'
): Promise<Set<string>> {
  const res = await db.query(`SELECT id FROM ${table}`);
  return new Set((res.values ?? []).map((r) => String((r as { id: string }).id)));
}

async function sqlIdSet(table: 'santri' | 'kamar'): Promise<Set<string>> {
  return withSql((db) => sqlIdSetOnDb(db, table));
}

/** Pastikan santri ada di tabel induk sebelum absensi/izin/BK (hindari FOREIGN KEY gagal). */
export async function requireSantriInDatabase(
  santriId: string,
  db?: SQLiteDBConnection
): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  const id = String(santriId ?? '').trim();
  if (!id) throw new SqlForeignKeyError('Santri wajib dipilih.');
  const ids = db ? await sqlIdSetOnDb(db, 'santri') : await sqlIdSet('santri');
  if (!ids.has(id)) {
    throw new SqlForeignKeyError(
      'Santri tidak ada di database lokal. Muat ulang daftar santri atau simpan data santri terlebih dahulu.'
    );
  }
}

/** Sinkronkan ketua_santri_id dengan nama ketua + trigger SQLite (ketua harus di kamar ini). */
export async function resolveKetuaSantriIdForKamarRow(
  db: SQLiteDBConnection,
  row: Record<string, unknown>
): Promise<string | null> {
  const kamarId = String(row.id);
  const ketuaName = row.ketua ? String(row.ketua).trim() : '';
  if (!ketuaName) return null;

  const verifyInKamar = async (santriId: string) => {
    const res = await db.query(`SELECT id FROM santri WHERE id = ? AND kamar_id = ?`, [
      santriId,
      kamarId,
    ]);
    return Boolean(res.values?.length);
  };

  if (row.ketua_santri_id) {
    const sid = String(row.ketua_santri_id);
    if (await verifyInKamar(sid)) return sid;
  }

  const hit = (
    await db.query(`SELECT id FROM santri WHERE trim(nama) = ? AND kamar_id = ?`, [
      ketuaName,
      kamarId,
    ])
  ).values?.[0] as { id?: string } | undefined;
  return hit?.id ? String(hit.id) : null;
}

function kamarSqlParams(
  row: Record<string, unknown>,
  ketuaId: string | null
): (string | number | null)[] {
  return [
    String(row.id),
    strField(row, 'nama'),
    Number(row.kapasitas) || 4,
    optStr(row, 'lantai'),
    ketuaId,
    JSON.stringify(row.fasilitas ?? []),
    optStr(row, 'asrama_id'),
  ];
}

/** Satu baris kamar — tanpa BEGIN TRANSACTION / flush penuh (stabil di Android). */
export async function sqlUpsertKamarRow(row: Record<string, unknown>): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    const ketuaId = await resolveKetuaSantriIdForKamarRow(db, row);
    await db.run(
      `INSERT INTO kamar (id, nama, kapasitas, lantai, ketua_santri_id, fasilitas_json, asrama_id) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         nama=excluded.nama,
         kapasitas=excluded.kapasitas,
         lantai=excluded.lantai,
         ketua_santri_id=excluded.ketua_santri_id,
         fasilitas_json=excluded.fasilitas_json,
         asrama_id=excluded.asrama_id`,
      kamarSqlParams(row, ketuaId)
    );
  });
}

// ——— Reads ———

export async function sqlListIzinInRange(dari: string, sampai: string): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const start = `${dari.slice(0, 10)}T00:00:00`;
  const end = `${sampai.slice(0, 10)}T23:59:59.999`;
  const res = await db.query(
    `SELECT i.*, s.nama AS santri_nama, k.nama AS santri_kamar, s.nomor_wali AS santri_wali
     FROM izin i
     LEFT JOIN santri s ON s.id = i.santri_id
     LEFT JOIN kamar k ON k.id = s.kamar_id
     WHERE i.tanggal_keluar >= ? AND i.tanggal_keluar <= ?
     ORDER BY i.tanggal_keluar DESC`,
    [start, end]
  );
  return (res.values ?? []) as Record<string, unknown>[];
}

export async function sqlListPembinaanInRange(
  dari: string,
  sampai: string
): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const start = `${dari.slice(0, 10)}T00:00:00`;
  const end = `${sampai.slice(0, 10)}T23:59:59.999`;
  const res = await db.query(
    `SELECT p.*, s.nama AS santri_nama, k.nama AS santri_kamar
     FROM pembinaan p
     INNER JOIN santri s ON s.id = p.santri_id
     LEFT JOIN kamar k ON k.id = s.kamar_id
     WHERE p.tanggal >= ? AND p.tanggal <= ?
     ORDER BY p.tanggal DESC`,
    [start, end]
  );
  return (res.values ?? []) as Record<string, unknown>[];
}

export async function sqlListIzinEnriched(): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const res = await db.query(
    `SELECT i.*,
       COALESCE(s.nama, '') AS santri_nama,
       COALESCE(k.nama, '') AS santri_kamar,
       COALESCE(s.nomor_wali, '') AS santri_wali
     FROM izin i
     INNER JOIN santri s ON s.id = i.santri_id
     LEFT JOIN kamar k ON k.id = s.kamar_id
     ORDER BY i.tanggal_keluar DESC`
  );
  return (res.values ?? []) as Record<string, unknown>[];
}

export async function sqlFindIzinBelumForSantri(santriId: string): Promise<Record<string, unknown> | null> {
  if (!shouldPersistToSqlite()) return null;
  const db = await conn();
  const res = await db.query(
    `SELECT * FROM izin WHERE santri_id = ? AND status_kembali = ? LIMIT 1`,
    [santriId, 'Belum']
  );
  return res.values?.[0] ? (res.values[0] as Record<string, unknown>) : null;
}

export async function sqlListPembinaanEnriched(): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const res = await db.query(
    `SELECT p.*,
       COALESCE(s.nama, '') AS santri_nama,
       COALESCE(k.nama, '') AS santri_kamar
     FROM pembinaan p
     INNER JOIN santri s ON s.id = p.santri_id
     LEFT JOIN kamar k ON k.id = s.kamar_id
     ORDER BY p.tanggal DESC`
  );
  return (res.values ?? []) as Record<string, unknown>[];
}

function mapAbsensiQueryRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    santri_id: row.santri_id,
    kegiatan: row.kegiatan ?? row.kegiatan_nama ?? row.kegiatan_label,
    kegiatan_id: row.kegiatan_id,
    tanggal: row.tanggal,
    status: row.status,
    catatan: row.catatan,
    santri_nama: row.santri_nama,
    santri_kamar: row.santri_kamar,
  };
}

/** Absensi satu hari (opsional filter kegiatan) — untuk layar presensi harian. */
export async function sqlListAbsensiForDate(
  dateKey: string,
  kegiatan?: string
): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const day = dateKey.slice(0, 10);
  const params: string[] = [day, `${day}%`];
  let kegiatanClause = '';
  if (kegiatan?.trim()) {
    kegiatanClause = ' AND g.nama = ?';
    params.push(kegiatan.trim());
  }
  const res = await db.query(
    `SELECT a.id, a.santri_id, g.nama AS kegiatan, a.kegiatan_id, a.tanggal, a.status, a.catatan,
            s.nama AS santri_nama, k.nama AS santri_kamar
     FROM absensi a
     INNER JOIN kegiatan g ON g.id = a.kegiatan_id
     LEFT JOIN santri s ON s.id = a.santri_id
     LEFT JOIN kamar k ON k.id = s.kamar_id
     WHERE (a.tanggal = ? OR a.tanggal LIKE ?)${kegiatanClause}
     ORDER BY s.nama COLLATE NOCASE`,
    params
  );
  return (res.values ?? []).map((row) => mapAbsensiQueryRow(row as Record<string, unknown>));
}

/** Rentang tanggal inklusif (YYYY-MM-DD) — untuk laporan. */
export async function sqlListAbsensiInRange(
  dari: string,
  sampai: string
): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const start = dari.slice(0, 10);
  const end = sampai.slice(0, 10);
  const res = await db.query(
    `SELECT a.id, a.santri_id, g.nama AS kegiatan, a.tanggal, a.status,
            s.nama AS santri_nama, k.nama AS santri_kamar
     FROM absensi a
     INNER JOIN kegiatan g ON g.id = a.kegiatan_id
     LEFT JOIN santri s ON s.id = a.santri_id
     LEFT JOIN kamar k ON k.id = s.kamar_id
     WHERE a.tanggal >= ? AND a.tanggal <= ?
     ORDER BY a.tanggal DESC`,
    [start, end]
  );
  return (res.values ?? []).map((row) => mapAbsensiQueryRow(row as Record<string, unknown>));
}

export async function sqlDashboardAbsensiStats(): Promise<{
  kegiatanTerakhir: string;
  hadirTerakhir: number;
}> {
  if (!shouldPersistToSqlite()) {
    return { kegiatanTerakhir: 'Belum ada absensi', hadirTerakhir: 0 };
  }
  return withSql(async (db) => {
    const latest = await db.query(
      `SELECT g.nama AS kegiatan_nama, a.tanggal, a.kegiatan_id
       FROM absensi a
       INNER JOIN kegiatan g ON g.id = a.kegiatan_id
       ORDER BY a.tanggal DESC LIMIT 1`
    );
    if (!latest.values?.length) {
      return { kegiatanTerakhir: 'Belum ada absensi', hadirTerakhir: 0 };
    }
    const row = latest.values[0] as {
      kegiatan_nama?: string;
      kegiatan_id?: string;
      tanggal?: string;
    };
    const kegiatan = String(row.kegiatan_nama ?? '');
    const countRes = await db.query(
      `SELECT COUNT(*) AS c FROM absensi WHERE kegiatan_id = ? AND tanggal = ? AND status = ?`,
      [String(row.kegiatan_id ?? ''), normalizeDateKey(row.tanggal), 'Hadir']
    );
    const hadirTerakhir = Number((countRes.values?.[0] as { c?: number })?.c ?? 0);
    return { kegiatanTerakhir: kegiatan || 'Belum ada absensi', hadirTerakhir };
  });
}

export async function sqlListAbsensiEnriched(): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const res = await db.query(
    `SELECT a.id, a.santri_id, g.nama AS kegiatan, a.kegiatan_id, a.tanggal, a.status, a.catatan,
            s.nama AS santri_nama, k.nama AS santri_kamar
     FROM absensi a
     INNER JOIN kegiatan g ON g.id = a.kegiatan_id
     LEFT JOIN santri s ON s.id = a.santri_id
     LEFT JOIN kamar k ON k.id = s.kamar_id
     ORDER BY a.tanggal DESC LIMIT 500`
  );
  return (res.values ?? []).map((row) => mapAbsensiQueryRow(row as Record<string, unknown>));
}

export async function sqlListPenjadwalanRaw(): Promise<PenjadwalanEntry[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const res = await db.query(`SELECT * FROM penjadwalan ORDER BY tanggal`);
  return (res.values ?? []).map((row) => penjadwalanRowToEntry(row as Record<string, unknown>));
}

export async function sqlEnrichPenjadwalan(
  rows: PenjadwalanEntry[],
  kamarMeta: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return [];
  const db = await conn();
  const santriIds = [...new Set(rows.map((r) => r.santri_id).filter(Boolean))] as string[];
  const santriMap = new Map<string, { nama?: string; kamar?: string }>();
  if (santriIds.length) {
    const placeholders = santriIds.map(() => '?').join(',');
    const res = await db.query(
      `SELECT s.id, s.nama, k.nama AS kamar FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id WHERE s.id IN (${placeholders})`,
      santriIds
    );
    for (const row of res.values ?? []) {
      const r = row as Record<string, unknown>;
      santriMap.set(String(r.id), { nama: String(r.nama ?? ''), kamar: String(r.kamar ?? '') });
    }
  }
  const penghuniByKamar = new Map<string, number>();
  const penghuniRes = await db.query(
    `SELECT k.nama AS kamar_nama, COUNT(s.id) AS c FROM kamar k
     LEFT JOIN santri s ON s.kamar_id = k.id GROUP BY k.id`
  );
  for (const row of penghuniRes.values ?? []) {
    const r = row as Record<string, unknown>;
    penghuniByKamar.set(String(r.kamar_nama), Number(r.c) || 0);
  }

  return rows.map((row) => {
    const baseNama = row.assignee_nama?.trim();
    if (baseNama) {
      return {
        ...row,
        assignee_nama: baseNama,
        assignee_detail: row.assignee_detail,
      };
    }
    if (row.mode === 'kamar' && row.kamar_id) {
      const kamar = kamarMeta.find((k) => String(k.id) === row.kamar_id);
      const nama = kamar?.nama ? String(kamar.nama) : 'Kamar?';
      const ketua = kamar?.ketua ? String(kamar.ketua) : '';
      const count = penghuniByKamar.get(nama) ?? 0;
      return {
        ...row,
        assignee_nama: nama,
        assignee_detail: ketua ? `Ketua: ${ketua}` : count ? `${count} santri` : undefined,
      };
    }
    if (row.santri_id) {
      const santri = santriMap.get(row.santri_id);
      return {
        ...row,
        assignee_nama: santri?.nama || 'Santri?',
        assignee_detail: santri?.kamar || undefined,
      };
    }
    return { ...row, assignee_nama: '-' };
  });
}

function mapKamarRowFromSql(r: Record<string, unknown>): Record<string, unknown> {
  let fasilitas: unknown[] = [];
  if (r.fasilitas_json) {
    try {
      fasilitas = JSON.parse(String(r.fasilitas_json)) as unknown[];
    } catch {
      fasilitas = [];
    }
  }
  const ketuaFromJoin = r.ketua_nama ? String(r.ketua_nama) : '';
  const ketuaLegacy = r.ketua ? String(r.ketua) : '';
  return {
    id: r.id,
    nama: r.nama,
    kapasitas: r.kapasitas,
    lantai: r.lantai ?? '',
    ketua: ketuaFromJoin || ketuaLegacy,
    ketua_santri_id: r.ketua_santri_id ?? undefined,
    fasilitas,
    asrama_id: r.asrama_id ?? undefined,
  };
}

/** Daftar kamar dari SQLite (bukan hanya array in-memory) + penghuni per kamar. */
export async function sqlListKamarWithPenghuni(): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  return withSql(async (db) => {
    const kamarRes = await db.query(
      `SELECT k.*, s.nama AS ketua_nama
       FROM kamar k
       LEFT JOIN santri s ON s.id = k.ketua_santri_id
       ORDER BY k.nama COLLATE NOCASE`
    );
    const kamarRows = (kamarRes.values ?? []).map((row) =>
      mapKamarRowFromSql(row as Record<string, unknown>)
    );

    const res = await db.query(
      `SELECT s.id, s.nama, COALESCE(kl.nama, '') AS kelas, s.masuk_kamar_sejak, k.nama AS kamar_nama
       FROM santri s
       INNER JOIN kamar k ON k.id = s.kamar_id
       LEFT JOIN kelas kl ON kl.id = s.kelas_id`
    );
    const byKamar = new Map<string, Record<string, unknown>[]>();
    for (const row of res.values ?? []) {
      const r = row as Record<string, unknown>;
      const nama = String(r.kamar_nama);
      const list = byKamar.get(nama) ?? [];
      list.push({
        id: r.id,
        nama: r.nama,
        kelas: r.kelas,
        masuk_kamar_sejak: r.masuk_kamar_sejak,
      });
      byKamar.set(nama, list);
    }
    return kamarRows.map((k) => {
      const penghuni = byKamar.get(String(k.nama)) ?? [];
      return {
        ...k,
        terisi: penghuni.length,
        santriList: penghuni,
      };
    });
  });
}

export async function sqlListSantriPenjadwalan(): Promise<
  { id: string; nama?: string; kamar?: string }[]
> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const res = await db.query(
    `SELECT s.id, s.nama, k.nama AS kamar FROM santri s LEFT JOIN kamar k ON k.id = s.kamar_id`
  );
  return (res.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      nama: r.nama ? String(r.nama) : undefined,
      kamar: r.kamar ? String(r.kamar) : undefined,
    };
  });
}

export async function sqlListKamarPenjadwalan(): Promise<{ id: string; nama?: string }[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const res = await db.query(`SELECT id, nama FROM kamar`);
  return (res.values ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return { id: String(r.id), nama: r.nama ? String(r.nama) : undefined };
  });
}

export async function sqlListRiwayatKamarForSantri(santriId: string): Promise<SantriKamarRiwayatRow[]> {
  if (!shouldPersistToSqlite()) return [];
  const db = await conn();
  const res = await db.query(
    `SELECT * FROM riwayat_kamar WHERE santri_id = ? ORDER BY tanggal DESC`,
    [santriId]
  );
  return (res.values ?? []).map((row) => {
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

export async function sqlGetSantriIdsSet(): Promise<Set<string>> {
  if (!shouldPersistToSqlite()) return new Set();
  const db = await conn();
  const res = await db.query(`SELECT id FROM santri`);
  return new Set((res.values ?? []).map((r) => String((r as { id: string }).id)));
}

export async function sqlGetKamarIdsSet(): Promise<Set<string>> {
  if (!shouldPersistToSqlite()) return new Set();
  const db = await conn();
  const res = await db.query(`SELECT id FROM kamar`);
  return new Set((res.values ?? []).map((r) => String((r as { id: string }).id)));
}

export async function sqlLoadFullSnapshotForBackup(): Promise<Record<string, unknown> | null> {
  const snap = await loadOfflineDbSnapshot();
  return snap as Record<string, unknown> | null;
}

// ——— Writes ———

export async function sqlUpsertSantriRow(
  row: Record<string, unknown>,
  kamarList: Record<string, unknown>[]
): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
  const kamarId = resolveKamarId(kamarList, strField(row, 'kamar'));
  const resolved =
    kamarId && kamarList.some((k) => String(k.id) === kamarId) ? kamarId : null;
  const kelasRes = await db.query(`SELECT id, nama, tingkat FROM kelas`);
  const kelasList = (kelasRes.values ?? []).map((r) => {
    const x = r as { id: string; nama?: string; tingkat?: string };
    return { id: String(x.id), nama: String(x.nama ?? ''), tingkat: x.tingkat };
  });
  const kelasId =
    resolveKelasId(kelasList, row.kelas_id) ??
    resolveKelasId(kelasList, row.kelas) ??
    kelasList[0]?.id ??
    '';
  const now = new Date().toISOString();
  const actor = currentActorName();
  await db.run(
    `INSERT INTO santri (
      id, nama, kelas_id, kamar_id, nomor_wali, jenis_kelamin, include_wa, catatan, catatan_medis, foto,
      jumlah_pelanggaran, masuk_kamar_sejak,
      asal_provinsi_code, asal_provinsi_nama, asal_kota_code, asal_kota_nama,
      asal_kecamatan_code, asal_kecamatan_nama, asal_desa_code, asal_desa_nama,
      asrama_id, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      nama=excluded.nama, kelas_id=excluded.kelas_id, kamar_id=excluded.kamar_id,
      nomor_wali=excluded.nomor_wali, jenis_kelamin=excluded.jenis_kelamin, include_wa=excluded.include_wa,
      updated_by=excluded.updated_by,
      catatan=excluded.catatan, catatan_medis=excluded.catatan_medis, foto=excluded.foto,
      jumlah_pelanggaran=excluded.jumlah_pelanggaran, masuk_kamar_sejak=excluded.masuk_kamar_sejak,
      asal_provinsi_code=excluded.asal_provinsi_code, asal_provinsi_nama=excluded.asal_provinsi_nama,
      asal_kota_code=excluded.asal_kota_code, asal_kota_nama=excluded.asal_kota_nama,
      asal_kecamatan_code=excluded.asal_kecamatan_code, asal_kecamatan_nama=excluded.asal_kecamatan_nama,
      asal_desa_code=excluded.asal_desa_code, asal_desa_nama=excluded.asal_desa_nama,
      asrama_id=excluded.asrama_id,
      updated_at=excluded.updated_at`,
    [
      String(row.id),
      strField(row, 'nama'),
      kelasId,
      resolved,
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
      optStr(row, 'created_by') ?? actor,
      actor ?? optStr(row, 'updated_by'),
      optStr(row, 'created_at') ?? now,
      optStr(row, 'updated_at') ?? now,
    ]
  );
  });
}

export async function sqlInsertIzin(row: Record<string, unknown>): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
  await requireSantriInDatabase(strField(row, 'santri_id'), db);
  await db.run(
    `INSERT INTO izin (id, santri_id, alasan, tanggal_keluar, batas_kembali, status_kembali, penjemput, waktu_kembali_aktual, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  });
}

export async function sqlUpdateIzinRow(row: Record<string, unknown>): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(
      `UPDATE izin SET status_kembali=?, waktu_kembali_aktual=? WHERE id=?`,
      [strField(row, 'status_kembali'), optStr(row, 'waktu_kembali_aktual'), String(row.id)]
    );
  });
}

export async function sqlDeleteIzinById(id: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await recordSyncTombstone('izin', id);
  await withWrite(async (db) => {
    await db.run(`DELETE FROM izin WHERE id = ?`, [id]);
  });
}

export async function sqlInsertPembinaan(row: Record<string, unknown>): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
  await requireSantriInDatabase(strField(row, 'santri_id'), db);
  await db.run(
    `INSERT INTO pembinaan (id, santri_id, jenis, keterangan, tanggal, tindak_lanjut, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
  });
}

export async function sqlDeletePembinaanById(id: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await recordSyncTombstone('pembinaan', id);
  await withWrite(async (db) => {
    await db.run(`DELETE FROM pembinaan WHERE id = ?`, [id]);
  });
}

/** Samakan hitungan pelanggaran santri dengan jumlah catatan jenis Pelanggaran. */
export async function sqlRecalculateSantriPelanggaran(santriId: string): Promise<number> {
  if (!shouldPersistToSqlite()) return 0;
  let count = 0;
  await withWrite(async (db) => {
    const res = await db.query(
      `SELECT COUNT(*) AS c FROM pembinaan WHERE santri_id = ? AND jenis = 'Pelanggaran'`,
      [santriId]
    );
    const row = res.values?.[0] as { c?: number } | undefined;
    count = Number(row?.c) || 0;
    await db.run(`UPDATE santri SET jumlah_pelanggaran = ? WHERE id = ?`, [count, santriId]);
  });
  return count;
}

export async function sqlUpsertAbsensiRow(
  row: Record<string, unknown>,
  kegiatan: Record<string, unknown>[]
): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
  await requireSantriInDatabase(strField(row, 'santri_id'), db);
  const label = strField(row, 'kegiatan');
  const kegiatanId =
    row.kegiatan_id ? String(row.kegiatan_id) : resolveKegiatanId(kegiatan, label);
  if (!kegiatanId) {
    throw new SqlForeignKeyError('Kegiatan absensi tidak ditemukan.');
  }
  const tanggal = normalizeDateKey(row.tanggal);
  await db.run(
    `INSERT INTO absensi (id, santri_id, kegiatan_id, tanggal, status, catatan, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET status=excluded.status, tanggal=excluded.tanggal, catatan=excluded.catatan, updated_at=datetime('now')`,
    [
      String(row.id),
      strField(row, 'santri_id'),
      kegiatanId,
      tanggal,
      strField(row, 'status'),
      optStr(row, 'catatan'),
    ]
  );
  });
}

export async function sqlFindAbsensiByKey(
  santriId: string,
  kegiatan: string,
  dateKey: string
): Promise<Record<string, unknown> | null> {
  if (!shouldPersistToSqlite()) return null;
  const db = await conn();
  const res = await db.query(
    `SELECT a.* FROM absensi a
     INNER JOIN kegiatan g ON g.id = a.kegiatan_id
     WHERE a.santri_id = ? AND g.nama = ? AND (a.tanggal = ? OR a.tanggal LIKE ?) LIMIT 1`,
    [santriId, kegiatan, dateKey.slice(0, 10), `${dateKey.slice(0, 10)}%`]
  );
  return res.values?.[0] ? (res.values[0] as Record<string, unknown>) : null;
}

export async function sqlDeleteAbsensiById(id: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await recordSyncTombstone('absensi', id);
  await withWrite(async (db) => {
    await db.run(`DELETE FROM absensi WHERE id = ?`, [id]);
  });
}

export async function sqlUpsertPenjadwalanRow(row: Record<string, unknown>): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    const entry = penjadwalanRowToEntry(row);
    if (!entry.assignee_nama || entry.assignee_nama === '-') {
      throw new SqlForeignKeyError('Penugasan jadwal tidak valid.');
    }
    await db.run(
      `INSERT INTO penjadwalan (
        id, jenis, tanggal, mode,
        assignee_santri_id, assignee_kamar_id, assignee_nama, assignee_detail,
        catatan, generated_at, generate_batch_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         jenis=excluded.jenis, tanggal=excluded.tanggal, mode=excluded.mode,
         assignee_santri_id=excluded.assignee_santri_id, assignee_kamar_id=excluded.assignee_kamar_id,
         assignee_nama=excluded.assignee_nama, assignee_detail=excluded.assignee_detail,
         catatan=excluded.catatan, generated_at=excluded.generated_at, generate_batch_id=excluded.generate_batch_id`,
      penjadwalanInsertParams(entry)
    );
  });
}

export async function sqlDeletePenjadwalanById(id: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await recordSyncTombstone('penjadwalan', id);
  await withWrite(async (db) => {
    await db.run(`DELETE FROM penjadwalan WHERE id = ?`, [id]);
  });
}

export async function sqlDeletePenjadwalanJenisRange(
  jenis: string,
  dari: string,
  sampai: string
): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(
      `DELETE FROM penjadwalan WHERE jenis = ? AND tanggal >= ? AND tanggal <= ?`,
      [jenis, dari, sampai]
    );
  });
}

export async function sqlDeletePenjadwalanByJenis(jenis: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`DELETE FROM penjadwalan WHERE jenis = ?`, [jenis]);
  });
}

export async function sqlDeletePenjadwalanPresetByJenis(jenis: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`DELETE FROM penjadwalan_preset WHERE jenis = ?`, [jenis]);
  });
}

export async function sqlDeletePenjadwalanJenisBulan(jenis: string, bulanPrefix: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`DELETE FROM penjadwalan WHERE jenis = ? AND tanggal LIKE ?`, [
      jenis,
      `${bulanPrefix}%`,
    ]);
  });
}

export async function sqlInsertPenjadwalanMany(rows: Record<string, unknown>[]): Promise<void> {
  if (!shouldPersistToSqlite() || !rows.length) return;
  await withWrite(async (db) => {
    for (const row of rows) {
      const entry = penjadwalanRowToEntry(row);
      if (!entry.assignee_nama || entry.assignee_nama === '-') continue;
      await db.run(
        `INSERT OR IGNORE INTO penjadwalan (
          id, jenis, tanggal, mode,
          assignee_santri_id, assignee_kamar_id, assignee_nama, assignee_detail,
          catatan, generated_at, generate_batch_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        penjadwalanInsertParams(entry)
      );
    }
  });
}

async function riwayatKamarTableHasV4Columns(db: SQLiteDBConnection): Promise<boolean> {
  const result = await db.query(`PRAGMA table_info(riwayat_kamar)`);
  return (result.values ?? []).some(
    (r) => (r as { name?: string }).name === 'kamar_sebelumnya_id'
  );
}

export async function sqlInsertRiwayatKamar(
  row: SantriKamarRiwayatRow,
  kamarList: Record<string, unknown>[]
): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  const kamarRefs = kamarList as { id: string; nama?: string }[];
  const kamarId = coerceKamarForeignKeyId(kamarRefs, row.kamar_nama, row.kamar_id);
  const { prevId, prevNama, prevLegacy } = resolveRiwayatKamarSebelumnyaFields(row, kamarRefs);
  await withWrite(async (db) => {
    await requireSantriInDatabase(String(row.santri_id), db);
    const v4 = await riwayatKamarTableHasV4Columns(db);
    if (v4) {
      await db.run(
        `INSERT INTO riwayat_kamar (id, santri_id, kamar_id, kamar_nama, kamar_sebelumnya_id, kamar_sebelumnya_nama, tipe, tanggal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
    } else {
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
    }
  });
}

export async function sqlBumpSantriPelanggaran(santriId: string, delta: number): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(
      `UPDATE santri SET jumlah_pelanggaran = COALESCE(jumlah_pelanggaran, 0) + ? WHERE id = ?`,
      [delta, santriId]
    );
  });
}

export async function sqlVacateKamarResidents(kamarId: string): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`UPDATE santri SET kamar_id = NULL, masuk_kamar_sejak = NULL WHERE kamar_id = ?`, [
      kamarId,
    ]);
  });
}

/** v4: penjadwalan tidak dihapus saat kamar dihapus (snapshot generate). */
export async function sqlDeletePenjadwalanByKamarId(_kamarId: string): Promise<void> {
  return;
}

export async function sqlSetSantriPelanggaran(santriId: string, value: number): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`UPDATE santri SET jumlah_pelanggaran = ? WHERE id = ?`, [value, santriId]);
  });
}

export async function sqlClearAllAbsensi(): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`DELETE FROM absensi`);
  });
}

export async function sqlClearAllIzin(): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`DELETE FROM izin`);
  });
}

/** Hapus catatan BK + nolkan hitungan pelanggaran semua santri. */
export async function sqlClearAllPelanggaran(): Promise<void> {
  if (!shouldPersistToSqlite()) return;
  await withWrite(async (db) => {
    await db.run(`DELETE FROM pembinaan`);
    await db.run(`UPDATE santri SET jumlah_pelanggaran = 0`);
  });
}
