/**
 * Full-online Turso: baca/tulis ke tabel entity (santri, kamar, …),
 * bukan hanya app_data_snapshot.
 */
import type { Client, InArgs, InStatement } from '@libsql/client/web';
import type { OfflineDbSnapshot } from '@/lib/db/snapshot-types';
import { currentActorName } from '@/lib/app-auth';
import { mergeAppSettings, type AppSettings } from '@/lib/app-settings';
import { penjadwalanRowToEntry, penjadwalanInsertParams } from '@/lib/db/penjadwalan-storage';
import { normalizeDateKey } from '@/lib/db/date-normalize';
import type { PenjadwalanPreset } from '@/lib/penjadwalan';
import type { SantriKamarRiwayatRow } from '@/lib/santri-kamar-riwayat';

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return v === undefined || v === null ? '' : String(v);
}

function opt(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (v === undefined || v === null || v === '') return null;
  return String(v);
}

function normalizeTingkat(raw: unknown): 'MTS' | 'ALIYAH' {
  const t = String(raw ?? '').toUpperCase();
  return t === 'ALIYAH' ? 'ALIYAH' : 'MTS';
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

function resolveKelasId(
  kelasList: Record<string, unknown>[],
  raw: unknown
): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw);
  const byId = kelasList.find((k) => String(k.id) === s);
  if (byId) return String(byId.id);
  const byNama = kelasList.find((k) => String(k.nama ?? '') === s);
  return byNama ? String(byNama.id) : null;
}

function resolveKegiatanId(kegiatan: Record<string, unknown>[], label: string): string | null {
  const hit = kegiatan.find((k) => String(k.nama ?? '') === label);
  return hit ? String(hit.id) : null;
}

async function execMany(client: Client, stmts: InStatement[]): Promise<void> {
  if (!stmts.length) return;
  const chunk = 40;
  for (let i = 0; i < stmts.length; i += chunk) {
    await client.batch(stmts.slice(i, i + chunk), 'write');
  }
}

function stmt(sql: string, args: InArgs = []): InStatement {
  return { sql, args };
}

/** Hapus isi tabel entity (urutan aman FK), lalu isi ulang dari snapshot RAM. */
let tursoSchemaPatched = false;

/** Patch kolom baru di database Turso lama (aman diulang). */
export async function ensureTursoSchemaPatches(client: Client): Promise<void> {
  if (tursoSchemaPatched) return;
  const alters = [`ALTER TABLE santri ADD COLUMN jenis_kelamin TEXT`];
  for (const t of TOMBSTONE_TABLES_ARR) {
    alters.push(
      `ALTER TABLE ${t} ADD COLUMN created_by TEXT`,
      `ALTER TABLE ${t} ADD COLUMN updated_by TEXT`
    );
  }
  for (const sql of alters) {
    try {
      await client.execute(sql);
    } catch {
      /* kolom sudah ada */
    }
  }
  tursoSchemaPatched = true;
}

/**
 * mode 'replace': wipe lalu isi ulang (migrasi satu arah).
 * mode 'upsert' : upsert per baris tanpa wipe — aman multi-device.
 */
export async function writeSnapshotToTursoTables(
  client: Client,
  snapshot: OfflineDbSnapshot,
  mode: 'replace' | 'upsert' = 'replace'
): Promise<void> {
  await ensureTursoSchemaPatches(client);
  const kelas = (snapshot.kelas ?? []) as Record<string, unknown>[];
  const kamar = (snapshot.kamar ?? []) as Record<string, unknown>[];
  const santri = (snapshot.santri ?? []) as Record<string, unknown>[];
  const kegiatan = (snapshot.kegiatan ?? []) as Record<string, unknown>[];
  const presets = snapshot.penjadwalanPreset ?? [];
  const penjadwalan = (snapshot.penjadwalan ?? []) as Record<string, unknown>[];
  const absensi = (snapshot.absensi ?? []) as Record<string, unknown>[];
  const izin = (snapshot.izin ?? []) as Record<string, unknown>[];
  const pembinaan = (snapshot.pembinaan ?? []) as Record<string, unknown>[];
  const riwayat = (snapshot.riwayat_kamar ?? []) as SantriKamarRiwayatRow[];
  const now = new Date().toISOString();

  const clear: InStatement[] = [
    stmt(`DELETE FROM absensi`),
    stmt(`DELETE FROM izin`),
    stmt(`DELETE FROM pembinaan`),
    stmt(`DELETE FROM riwayat_kamar`),
    stmt(`DELETE FROM penjadwalan`),
    stmt(`DELETE FROM penjadwalan_preset`),
    stmt(`DELETE FROM santri`),
    stmt(`UPDATE kamar SET ketua_santri_id = NULL`),
    stmt(`DELETE FROM kamar`),
    stmt(`DELETE FROM kegiatan`),
    stmt(`DELETE FROM kelas`),
  ];
  if (mode === 'replace') {
    await execMany(client, clear);
  }

  const inserts: InStatement[] = [];

  for (const row of kelas) {
    inserts.push(
      stmt(
        `INSERT INTO kelas (id, nama, tingkat, updated_at) VALUES (?, ?, ?, ?)`,
        [String(row.id), str(row, 'nama'), normalizeTingkat(row.tingkat), opt(row, 'updated_at') ?? now]
      )
    );
  }

  for (const row of kegiatan) {
    inserts.push(
      stmt(
        `INSERT INTO kegiatan (
          id, nama, jenis, icon, jam_mulai, jam_selesai, waktu, urutan, untuk_absensi, hari_aktif_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.id),
          str(row, 'nama'),
          opt(row, 'jenis'),
          opt(row, 'icon'),
          opt(row, 'jam_mulai'),
          opt(row, 'jam_selesai'),
          opt(row, 'waktu'),
          Number(row.urutan) || 0,
          row.untuk_absensi === false ? 0 : 1,
          JSON.stringify(row.hari_aktif ?? []),
          opt(row, 'updated_at') ?? now,
        ]
      )
    );
  }

  // Kamar dulu tanpa ketua (hindari FK santri belum ada)
  for (const row of kamar) {
    inserts.push(
      stmt(
        `INSERT INTO kamar (id, nama, kapasitas, lantai, ketua_santri_id, fasilitas_json, asrama_id, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          String(row.id),
          str(row, 'nama'),
          Number(row.kapasitas) || 4,
          opt(row, 'lantai'),
          JSON.stringify(row.fasilitas ?? []),
          opt(row, 'asrama_id'),
          opt(row, 'updated_at') ?? now,
        ]
      )
    );
  }

  const fallbackKelasId = kelas[0] ? String(kelas[0].id) : null;
  for (const row of santri) {
    const kelasId =
      resolveKelasId(kelas, row.kelas_id) ??
      resolveKelasId(kelas, row.kelas) ??
      fallbackKelasId;
    if (!kelasId) continue;
    const kamarId =
      row.kamar_id && kamar.some((k) => String(k.id) === String(row.kamar_id))
        ? String(row.kamar_id)
        : resolveKamarId(kamar, str(row, 'kamar'));
    inserts.push(
      stmt(
        `INSERT INTO santri (
          id, nama, kelas_id, kamar_id, nomor_wali, jenis_kelamin, include_wa, catatan, catatan_medis, foto,
          jumlah_pelanggaran, masuk_kamar_sejak,
          asal_provinsi_code, asal_provinsi_nama, asal_kota_code, asal_kota_nama,
          asal_kecamatan_code, asal_kecamatan_nama, asal_desa_code, asal_desa_nama,
          asrama_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.id),
          str(row, 'nama'),
          kelasId,
          kamarId,
          opt(row, 'nomor_wali'),
          opt(row, 'jenis_kelamin'),
          row.include_wa === false ? 0 : 1,
          opt(row, 'catatan'),
          opt(row, 'catatan_medis'),
          opt(row, 'foto'),
          Number(row.jumlah_pelanggaran) || 0,
          opt(row, 'masuk_kamar_sejak'),
          opt(row, 'asal_provinsi_code'),
          opt(row, 'asal_provinsi_nama'),
          opt(row, 'asal_kota_code'),
          opt(row, 'asal_kota_nama'),
          opt(row, 'asal_kecamatan_code'),
          opt(row, 'asal_kecamatan_nama'),
          opt(row, 'asal_desa_code'),
          opt(row, 'asal_desa_nama'),
          opt(row, 'asrama_id'),
          opt(row, 'created_at') ?? now,
          opt(row, 'updated_at') ?? now,
        ]
      )
    );
  }

  // Set ketua kamar setelah santri ada
  for (const row of kamar) {
    const ketuaName = row.ketua ? String(row.ketua).trim() : '';
    let ketuaId: string | null = row.ketua_santri_id ? String(row.ketua_santri_id) : null;
    if (!ketuaId && ketuaName) {
      const hit = santri.find(
        (s) =>
          String(s.nama ?? '').trim() === ketuaName &&
          (String(s.kamar ?? '') === String(row.nama ?? '') ||
            String(s.kamar_id ?? '') === String(row.id))
      );
      if (hit) ketuaId = String(hit.id);
    }
    if (ketuaId) {
      inserts.push(
        stmt(`UPDATE kamar SET ketua_santri_id = ?, updated_at = ? WHERE id = ?`, [
          ketuaId,
          now,
          String(row.id),
        ])
      );
    }
  }

  for (const p of presets) {
    inserts.push(
      stmt(
        `INSERT INTO penjadwalan_preset (id, jenis, mode, mulai, bulan_ke_depan, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.jenis,
          p.mode,
          p.mulai,
          p.bulanKeDepan,
          p.updatedAt || now,
        ]
      )
    );
  }

  for (const row of penjadwalan) {
    const entry = penjadwalanRowToEntry(row);
    if (!entry.assignee_nama || entry.assignee_nama === '-') continue;
    const params = penjadwalanInsertParams(entry);
    inserts.push(
      stmt(
        `INSERT OR IGNORE INTO penjadwalan (
          id, jenis, tanggal, mode,
          assignee_santri_id, assignee_kamar_id, assignee_nama, assignee_detail,
          catatan, generated_at, generate_batch_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...params, opt(row, 'updated_at') ?? now]
      )
    );
  }

  const santriIds = new Set(santri.map((s) => String(s.id)));
  for (const row of absensi) {
    const sid = str(row, 'santri_id');
    if (!santriIds.has(sid)) continue;
    const label = str(row, 'kegiatan');
    const kegiatanId = row.kegiatan_id
      ? String(row.kegiatan_id)
      : resolveKegiatanId(kegiatan, label);
    if (!kegiatanId) continue;
    inserts.push(
      stmt(
        `INSERT OR IGNORE INTO absensi (id, santri_id, kegiatan_id, tanggal, status, catatan, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.id),
          sid,
          kegiatanId,
          normalizeDateKey(row.tanggal),
          str(row, 'status'),
          opt(row, 'catatan'),
          opt(row, 'updated_at') ?? now,
        ]
      )
    );
  }

  for (const row of izin) {
    const sid = str(row, 'santri_id');
    if (!santriIds.has(sid)) continue;
    inserts.push(
      stmt(
        `INSERT INTO izin (
          id, santri_id, alasan, tanggal_keluar, batas_kembali, status_kembali,
          penjemput, waktu_kembali_aktual, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.id),
          sid,
          str(row, 'alasan'),
          str(row, 'tanggal_keluar'),
          str(row, 'batas_kembali'),
          str(row, 'status_kembali') || 'Belum',
          opt(row, 'penjemput'),
          opt(row, 'waktu_kembali_aktual'),
          opt(row, 'created_at') ?? now,
          opt(row, 'updated_at') ?? now,
        ]
      )
    );
  }

  for (const row of pembinaan) {
    const sid = str(row, 'santri_id');
    if (!santriIds.has(sid)) continue;
    inserts.push(
      stmt(
        `INSERT INTO pembinaan (
          id, santri_id, jenis, keterangan, tanggal, tindak_lanjut, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(row.id),
          sid,
          str(row, 'jenis'),
          str(row, 'keterangan'),
          str(row, 'tanggal'),
          opt(row, 'tindak_lanjut'),
          opt(row, 'created_at') ?? now,
          opt(row, 'updated_at') ?? now,
        ]
      )
    );
  }

  for (const row of riwayat) {
    const sid = String(row.santri_id);
    if (!santriIds.has(sid)) continue;
    const kamarId =
      row.kamar_id && kamar.some((k) => String(k.id) === String(row.kamar_id))
        ? String(row.kamar_id)
        : resolveKamarId(kamar, row.kamar_nama);
    const prevId =
      row.kamar_sebelumnya_id &&
      kamar.some((k) => String(k.id) === String(row.kamar_sebelumnya_id))
        ? String(row.kamar_sebelumnya_id)
        : null;
    inserts.push(
      stmt(
        `INSERT INTO riwayat_kamar (
          id, santri_id, kamar_id, kamar_nama, kamar_sebelumnya_id, kamar_sebelumnya_nama,
          tipe, tanggal, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          sid,
          kamarId,
          row.kamar_nama,
          prevId,
          row.kamar_sebelumnya_nama ?? null,
          row.tipe,
          row.tanggal,
          opt(row, 'updated_at') ?? now,
        ]
      )
    );
  }

  const settingsPayload = JSON.stringify(
    mergeAppSettings({ ...snapshot.settings, setupSelesai: true })
  );
  inserts.push(
    stmt(
      `INSERT INTO app_settings (id, payload, updated_at) VALUES ('default', ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [settingsPayload, now]
    )
  );

  if (mode === 'upsert') {
    // INSERT OR REPLACE = delete+insert → melanggar FK. Pakai upsert murni.
    // + LWW per baris: versi lama device lain tidak menimpa data yang lebih baru.
    for (const st of inserts) {
      if (typeof st === 'string') continue;
      if (/ON CONFLICT/i.test(st.sql)) continue;
      const mm = /^INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+(\w+)\s*\(([^)]+)\)/i.exec(st.sql);
      if (!mm) continue;
      const table = mm[1];
      const cols = mm[2].split(',').map((c) => c.trim()).filter((c) => c && c !== 'id');
      if (!cols.length) continue;
      let sql = ` ON CONFLICT(id) DO UPDATE SET ${cols
        .map((c) => `${c} = excluded.${c}`)
        .join(', ')}`;
      if (cols.includes('updated_at')) {
        sql += ` WHERE datetime(excluded.updated_at) > datetime(${table}.updated_at)`;
      }
      st.sql += sql;
    }
  }
  await execMany(client, inserts);

  // Audit remote: isi created_by/updated_by untuk baris yang belum punya.
  const actor = currentActorName();
  if (actor) {
    for (const t of TOMBSTONE_TABLES_ARR) {
      await client
        .execute({
          sql: `UPDATE ${t} SET created_by = COALESCE(created_by, ?), updated_by = COALESCE(updated_by, ?)`,
          args: [actor, actor],
        })
        .catch(() => undefined);
    }
  }
}

/** Tabel entity yang boleh menerima tombstone hapus. */
const TOMBSTONE_TABLES_ARR = [
  'kelas',
  'kamar',
  'kegiatan',
  'santri',
  'absensi',
  'izin',
  'pembinaan',
  'riwayat_kamar',
  'penjadwalan',
  'penjadwalan_preset',
] as const;
const TOMBSTONE_TABLES = new Set<string>(TOMBSTONE_TABLES_ARR);

/** Pembersih anak sebelum parent dihapus di cloud (hindari FK gagal). */
const CHILD_CLEANUP: Record<string, string[]> = {
  santri: [
    `DELETE FROM absensi WHERE santri_id = ?`,
    `DELETE FROM izin WHERE santri_id = ?`,
    `DELETE FROM pembinaan WHERE santri_id = ?`,
    `DELETE FROM riwayat_kamar WHERE santri_id = ?`,
    `UPDATE kamar SET ketua_santri_id = NULL WHERE ketua_santri_id = ?`,
  ],
  kamar: [
    `UPDATE santri SET kamar_id = NULL WHERE kamar_id = ?`,
    `DELETE FROM riwayat_kamar WHERE kamar_id = ?`,
  ],
  kegiatan: [
    `DELETE FROM absensi WHERE kegiatan_id = ?`,
    `DELETE FROM penjadwalan WHERE kegiatan_id = ?`,
  ],
};

export async function ensureTursoTombstoneTable(client: Client): Promise<void> {
  await client.execute(`CREATE TABLE IF NOT EXISTS sync_tombstone (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    PRIMARY KEY (table_name, row_id)
  )`);
}

/** Terapkan tombstone lokal ke cloud: hapus baris remote + catat. Idempotent. */
export async function applyTombstonesToTurso(
  client: Client,
  tombstones: { table_name: string; row_id: string; deleted_at: string }[]
): Promise<number> {
  if (tombstones.length === 0) return 0;
  await ensureTursoTombstoneTable(client);
  let applied = 0;
  for (const t of tombstones) {
    if (!TOMBSTONE_TABLES.has(t.table_name)) continue;
    try {
      const stmts: InStatement[] = (CHILD_CLEANUP[t.table_name] ?? []).map((sql) =>
        stmt(sql, [t.row_id])
      );
      stmts.push(
        stmt(`DELETE FROM ${t.table_name} WHERE id = ?`, [t.row_id]),
        stmt(
          `INSERT OR REPLACE INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, ?)`,
          [t.table_name, t.row_id, t.deleted_at]
        )
      );
      await client.batch(stmts, 'write');
      applied += 1;
    } catch {
      try {
        await client.execute(
          `INSERT OR REPLACE INTO sync_tombstone (table_name, row_id, deleted_at) VALUES (?, ?, ?)`,
          [t.table_name, t.row_id, t.deleted_at]
        );
      } catch {
        /* coba lagi sync berikutnya */
      }
    }
  }
  return applied;
}

export async function countTursoOperationalRows(client: Client): Promise<{
  santri: number;
  kamar: number;
  kelas: number;
}> {
  const [s, k, kl] = await Promise.all([
    client.execute(`SELECT COUNT(*) AS c FROM santri`),
    client.execute(`SELECT COUNT(*) AS c FROM kamar`),
    client.execute(`SELECT COUNT(*) AS c FROM kelas`),
  ]);
  return {
    santri: Number(s.rows[0]?.c ?? 0),
    kamar: Number(k.rows[0]?.c ?? 0),
    kelas: Number(kl.rows[0]?.c ?? 0),
  };
}

/** Baca semua tabel entity → bentuk snapshot app. */
export async function readSnapshotFromTursoTables(
  client: Client
): Promise<OfflineDbSnapshot> {
  const [
    kelasRes,
    kamarRes,
    santriRes,
    kegiatanRes,
    presetRes,
    penjadwalanRes,
    absensiRes,
    izinRes,
    pembinaanRes,
    riwayatRes,
    settingsRes,
  ] = await Promise.all([
    client.execute(`SELECT * FROM kelas ORDER BY nama`),
    client.execute(
      `SELECT k.*, s.nama AS ketua_nama FROM kamar k LEFT JOIN santri s ON s.id = k.ketua_santri_id ORDER BY k.nama`
    ),
    client.execute(
      `SELECT s.*, k.nama AS kamar_nama_join, kl.nama AS kelas_nama_join
       FROM santri s
       LEFT JOIN kamar k ON k.id = s.kamar_id
       LEFT JOIN kelas kl ON kl.id = s.kelas_id
       ORDER BY s.nama`
    ),
    client.execute(`SELECT * FROM kegiatan ORDER BY urutan, nama`),
    client.execute(`SELECT * FROM penjadwalan_preset`),
    client.execute(`SELECT * FROM penjadwalan ORDER BY tanggal`),
    client.execute(
      `SELECT a.*, g.nama AS kegiatan_nama FROM absensi a LEFT JOIN kegiatan g ON g.id = a.kegiatan_id`
    ),
    client.execute(`SELECT * FROM izin ORDER BY tanggal_keluar DESC`),
    client.execute(`SELECT * FROM pembinaan ORDER BY tanggal DESC`),
    client.execute(`SELECT * FROM riwayat_kamar ORDER BY tanggal DESC`),
    client.execute(`SELECT payload FROM app_settings WHERE id = 'default' LIMIT 1`),
  ]);

  const kelas = kelasRes.rows.map((r) => ({
    id: String(r.id),
    nama: String(r.nama ?? ''),
    tingkat: r.tingkat ? String(r.tingkat) : undefined,
  }));

  const kamar = kamarRes.rows.map((r) => {
    let fasilitas: unknown[] = [];
    try {
      fasilitas = r.fasilitas_json ? JSON.parse(String(r.fasilitas_json)) : [];
    } catch {
      fasilitas = [];
    }
    return {
      id: String(r.id),
      nama: String(r.nama ?? ''),
      kapasitas: Number(r.kapasitas) || 4,
      lantai: r.lantai ? String(r.lantai) : '',
      ketua: r.ketua_nama ? String(r.ketua_nama) : '',
      ketua_santri_id: r.ketua_santri_id ? String(r.ketua_santri_id) : undefined,
      fasilitas,
      asrama_id: r.asrama_id ? String(r.asrama_id) : undefined,
    };
  });

  const santri = santriRes.rows.map((r) => ({
    id: String(r.id),
    nama: String(r.nama ?? ''),
    kelas_id: r.kelas_id ? String(r.kelas_id) : undefined,
    kelas: r.kelas_nama_join ? String(r.kelas_nama_join) : '',
    kamar: r.kamar_nama_join ? String(r.kamar_nama_join) : '',
    kamar_id: r.kamar_id ? String(r.kamar_id) : undefined,
    nomor_wali: r.nomor_wali ? String(r.nomor_wali) : '',
    jenis_kelamin: r.jenis_kelamin ? String(r.jenis_kelamin) : '',
    include_wa: r.include_wa === 0 || r.include_wa === 0n ? false : true,
    catatan: r.catatan ? String(r.catatan) : '',
    catatan_medis: r.catatan_medis ? String(r.catatan_medis) : '',
    foto: r.foto ? String(r.foto) : '',
    jumlah_pelanggaran: Number(r.jumlah_pelanggaran) || 0,
    masuk_kamar_sejak: r.masuk_kamar_sejak ? String(r.masuk_kamar_sejak) : undefined,
    asal_provinsi_code: r.asal_provinsi_code ? String(r.asal_provinsi_code) : undefined,
    asal_provinsi_nama: r.asal_provinsi_nama ? String(r.asal_provinsi_nama) : undefined,
    asal_kota_code: r.asal_kota_code ? String(r.asal_kota_code) : undefined,
    asal_kota_nama: r.asal_kota_nama ? String(r.asal_kota_nama) : undefined,
    asal_kecamatan_code: r.asal_kecamatan_code ? String(r.asal_kecamatan_code) : undefined,
    asal_kecamatan_nama: r.asal_kecamatan_nama ? String(r.asal_kecamatan_nama) : undefined,
    asal_desa_code: r.asal_desa_code ? String(r.asal_desa_code) : undefined,
    asal_desa_nama: r.asal_desa_nama ? String(r.asal_desa_nama) : undefined,
    asrama_id: r.asrama_id ? String(r.asrama_id) : undefined,
    created_at: r.created_at ? String(r.created_at) : undefined,
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
    created_by: r.created_by ? String(r.created_by) : undefined,
    updated_by: r.updated_by ? String(r.updated_by) : undefined,
  }));

  const kegiatan = kegiatanRes.rows.map((r) => {
    let hari: unknown[] = [];
    try {
      hari = r.hari_aktif_json ? JSON.parse(String(r.hari_aktif_json)) : [];
    } catch {
      hari = [];
    }
    return {
      id: String(r.id),
      nama: String(r.nama ?? ''),
      jenis: r.jenis ? String(r.jenis) : '',
      icon: r.icon ? String(r.icon) : undefined,
      jam_mulai: r.jam_mulai ? String(r.jam_mulai) : '',
      jam_selesai: r.jam_selesai ? String(r.jam_selesai) : '',
      waktu: r.waktu ? String(r.waktu) : '',
      urutan: Number(r.urutan) || 0,
      untuk_absensi: !(r.untuk_absensi === 0 || r.untuk_absensi === 0n),
      hari_aktif: hari,
    };
  });

  const penjadwalanPreset: PenjadwalanPreset[] = presetRes.rows.map((r) => ({
    id: String(r.id),
    jenis: String(r.jenis),
    mode: r.mode as PenjadwalanPreset['mode'],
    mulai: String(r.mulai),
    bulanKeDepan: Number(r.bulan_ke_depan) || 1,
    gantiYangAda: false,
    updatedAt: String(r.updated_at),
  }));

  const penjadwalan = penjadwalanRes.rows.map((row) => ({
    ...penjadwalanRowToEntry(row as unknown as Record<string, unknown>),
  }));

  const absensi = absensiRes.rows.map((r) => ({
    id: String(r.id),
    santri_id: String(r.santri_id),
    kegiatan: r.kegiatan_nama ? String(r.kegiatan_nama) : '',
    kegiatan_id: r.kegiatan_id ? String(r.kegiatan_id) : undefined,
    tanggal: String(r.tanggal),
    status: String(r.status),
    catatan: r.catatan ? String(r.catatan) : undefined,
  }));

  const izin = izinRes.rows.map((r) => ({
    id: String(r.id),
    santri_id: String(r.santri_id),
    alasan: String(r.alasan ?? ''),
    tanggal_keluar: String(r.tanggal_keluar ?? ''),
    batas_kembali: String(r.batas_kembali ?? ''),
    status_kembali: String(r.status_kembali ?? 'Belum'),
    penjemput: r.penjemput ? String(r.penjemput) : undefined,
    waktu_kembali_aktual: r.waktu_kembali_aktual
      ? String(r.waktu_kembali_aktual)
      : undefined,
    created_at: r.created_at ? String(r.created_at) : undefined,
  }));

  const pembinaan = pembinaanRes.rows.map((r) => ({
    id: String(r.id),
    santri_id: String(r.santri_id),
    jenis: String(r.jenis),
    keterangan: String(r.keterangan ?? ''),
    tanggal: String(r.tanggal ?? ''),
    tindak_lanjut: r.tindak_lanjut ? String(r.tindak_lanjut) : undefined,
    created_at: r.created_at ? String(r.created_at) : undefined,
  }));

  const riwayat_kamar: SantriKamarRiwayatRow[] = riwayatRes.rows.map((r) => ({
    id: String(r.id),
    santri_id: String(r.santri_id),
    kamar_id: r.kamar_id ? String(r.kamar_id) : undefined,
    kamar_nama: String(r.kamar_nama ?? ''),
    kamar_sebelumnya_id: r.kamar_sebelumnya_id ? String(r.kamar_sebelumnya_id) : undefined,
    kamar_sebelumnya_nama: r.kamar_sebelumnya_nama
      ? String(r.kamar_sebelumnya_nama)
      : undefined,
    tipe: String(r.tipe) as SantriKamarRiwayatRow['tipe'],
    tanggal: String(r.tanggal),
  }));

  let settings: AppSettings = mergeAppSettings({ setupSelesai: true });
  if (settingsRes.rows[0]?.payload) {
    try {
      settings = mergeAppSettings({
        ...(JSON.parse(String(settingsRes.rows[0].payload)) as Partial<AppSettings>),
        setupSelesai: true,
      });
    } catch {
      /* keep default */
    }
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
    settings,
  };
}
