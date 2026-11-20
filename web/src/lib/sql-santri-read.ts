import { runSqlExclusive, shouldPersistToSqlite } from './offline-db';
import type { PagedResponse } from './api-pagination';
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE } from './api-pagination';

export function mapSantriSqlRow(r: Record<string, unknown>): Record<string, unknown> {
  const kamarNama = (r.kamar_nama_join as string) || '';
  const kelasNama = (r.kelas_nama_join as string) || (r.kelas as string) || '';
  return {
    id: r.id,
    nama: r.nama,
    kelas_id: r.kelas_id ?? undefined,
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
    asrama_id: r.asrama_id ?? undefined,
  };
}

const SANTRI_FROM = `FROM santri s
  LEFT JOIN kamar k ON k.id = s.kamar_id
  LEFT JOIN kelas kl ON kl.id = s.kelas_id`;

function buildSantriWhere(
  q: string,
  kamar: string,
  asramaId?: string
): { clause: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (asramaId) {
    parts.push(`s.asrama_id = ?`);
    params.push(asramaId);
  }
  if (q) {
    const like = `%${q}%`;
    parts.push(
      `(s.nama LIKE ? COLLATE NOCASE OR kl.nama LIKE ? COLLATE NOCASE OR k.nama LIKE ? COLLATE NOCASE OR s.nomor_wali LIKE ?)`
    );
    params.push(like, like, like, like);
  }
  if (kamar && kamar !== 'Semua') {
    parts.push(`k.nama = ?`);
    params.push(kamar);
  }
  const clause = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  return { clause, params };
}

export async function sqlQuerySantriPage(opts: {
  page?: number;
  limit?: number;
  q?: string;
  kamar?: string;
  asramaId?: string;
}): Promise<PagedResponse<Record<string, unknown>>> {
  if (!shouldPersistToSqlite()) {
    return { items: [], total: 0, page: 1, limit: DEFAULT_LIST_PAGE_SIZE };
  }
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(MAX_LIST_PAGE_SIZE, Math.max(1, opts.limit ?? DEFAULT_LIST_PAGE_SIZE));
  const offset = (page - 1) * limit;
  const q = (opts.q ?? '').trim();
  const kamar = (opts.kamar ?? '').trim();
  const { clause, params } = buildSantriWhere(q, kamar, opts.asramaId);

  return runSqlExclusive(async (db) => {
    const countRes = await db.query(
      `SELECT COUNT(*) AS c ${SANTRI_FROM} ${clause}`,
      params
    );
    const total = Number((countRes.values?.[0] as { c?: number })?.c ?? 0);

    const rowsRes = await db.query(
      `SELECT s.*, k.nama AS kamar_nama_join, kl.nama AS kelas_nama_join ${SANTRI_FROM} ${clause} ORDER BY s.nama COLLATE NOCASE LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const items = (rowsRes.values ?? []).map((row) =>
      mapSantriSqlRow(row as Record<string, unknown>)
    );
    return { items, total, page, limit };
  });
}

export async function sqlGetSantriById(id: string): Promise<Record<string, unknown> | null> {
  if (!shouldPersistToSqlite()) return null;
  return runSqlExclusive(async (db) => {
    const res = await db.query(
      `SELECT s.*, k.nama AS kamar_nama_join, kl.nama AS kelas_nama_join ${SANTRI_FROM} WHERE s.id = ?`,
      [id]
    );
    if (!res.values?.length) return null;
    return mapSantriSqlRow(res.values[0] as Record<string, unknown>);
  });
}

export async function sqlListSantriSummary(asramaId?: string): Promise<Record<string, unknown>[]> {
  if (!shouldPersistToSqlite()) return [];
  return runSqlExclusive(async (db) => {
    const res = await db.query(
      `SELECT s.id, s.nama, kl.nama AS kelas, k.nama AS kamar,
      s.nomor_wali, s.jenis_kelamin, s.include_wa, s.created_at,
      s.asal_provinsi_code, s.asal_provinsi_nama, s.asal_kota_code, s.asal_kota_nama,
      s.asal_kecamatan_code, s.asal_kecamatan_nama, s.asal_desa_code, s.asal_desa_nama,
      s.jumlah_pelanggaran, s.masuk_kamar_sejak, s.asrama_id
     ${SANTRI_FROM}
     ${asramaId ? 'WHERE s.asrama_id = ?' : ''}
     ORDER BY s.nama COLLATE NOCASE`,
      asramaId ? [asramaId] : []
    );
    return (res.values ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id,
        nama: r.nama,
        kelas: r.kelas ?? '',
        kamar: r.kamar ?? '',
        nomor_wali: r.nomor_wali ?? '',
        jenis_kelamin: r.jenis_kelamin ?? '',
        include_wa: r.include_wa === 0 ? false : true,
        created_at: r.created_at ?? undefined,
        asal_provinsi_code: r.asal_provinsi_code,
        asal_provinsi_nama: r.asal_provinsi_nama,
        asal_kota_code: r.asal_kota_code,
        asal_kota_nama: r.asal_kota_nama,
        asal_kecamatan_code: r.asal_kecamatan_code,
        asal_kecamatan_nama: r.asal_kecamatan_nama,
        asal_desa_code: r.asal_desa_code,
        asal_desa_nama: r.asal_desa_nama,
        jumlah_pelanggaran: r.jumlah_pelanggaran ?? 0,
        masuk_kamar_sejak: r.masuk_kamar_sejak,
        asrama_id: r.asrama_id ?? undefined,
      };
    });
  });
}

export async function sqlCountIzinBelum(): Promise<number> {
  if (!shouldPersistToSqlite()) return 0;
  return runSqlExclusive(async (db) => {
    const res = await db.query(`SELECT COUNT(*) AS c FROM izin WHERE status_kembali = ?`, [
      'Belum',
    ]);
    return Number((res.values?.[0] as { c?: number })?.c ?? 0);
  });
}

export async function sqlCountSantri(asramaId?: string): Promise<number> {
  if (!shouldPersistToSqlite()) return 0;
  return runSqlExclusive(async (db) => {
    const res = await db.query(
      `SELECT COUNT(*) AS c FROM santri${asramaId ? ' WHERE asrama_id = ?' : ''}`,
      asramaId ? [asramaId] : []
    );
    return Number((res.values?.[0] as { c?: number })?.c ?? 0);
  });
}

export async function sqlCountPenghuniKamar(
  kamarNama: string,
  excludeSantriId?: string
): Promise<number> {
  if (!shouldPersistToSqlite()) return 0;
  return runSqlExclusive(async (db) => {
    const params = excludeSantriId ? [kamarNama, excludeSantriId] : [kamarNama];
    const extra = excludeSantriId ? ' AND s.id != ?' : '';
    const res = await db.query(
      `SELECT COUNT(*) AS c FROM santri s
     INNER JOIN kamar k ON k.id = s.kamar_id
     WHERE k.nama = ?${extra}`,
      params
    );
    return Number((res.values?.[0] as { c?: number })?.c ?? 0);
  });
}

export async function sqlPickLongestInKamar(
  kamarNama: string,
  excludeSantriId: string
): Promise<{ id: string; nama?: string; masuk_kamar_sejak?: string } | null> {
  if (!shouldPersistToSqlite()) return null;
  return runSqlExclusive(async (db) => {
    const res = await db.query(
      `SELECT s.id, s.nama, s.masuk_kamar_sejak FROM santri s
     INNER JOIN kamar k ON k.id = s.kamar_id
     WHERE k.nama = ? AND s.id != ?
     ORDER BY COALESCE(s.masuk_kamar_sejak, '') ASC
     LIMIT 1`,
      [kamarNama, excludeSantriId]
    );
    if (!res.values?.length) return null;
    const r = res.values[0] as Record<string, unknown>;
    return {
      id: String(r.id),
      nama: r.nama ? String(r.nama) : undefined,
      masuk_kamar_sejak: r.masuk_kamar_sejak ? String(r.masuk_kamar_sejak) : undefined,
    };
  });
}
