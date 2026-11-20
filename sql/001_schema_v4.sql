-- Turso Cloud schema for asrama (libSQL / SQLite)
-- APPLY MANUALLY — do not auto-run against production.
-- Database: asrama
--
-- Semua tabel entitas punya updated_at untuk sync last-write-wins.
-- Urutan CREATE memperhatikan FK.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS kelas (
  id          TEXT PRIMARY KEY,
  nama        TEXT NOT NULL,
  tingkat     TEXT NOT NULL CHECK (tingkat IN ('MTS', 'ALIYAH')),
  created_by          TEXT,
  updated_by          TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tingkat, nama)
);

CREATE TABLE IF NOT EXISTS kegiatan (
  id                  TEXT PRIMARY KEY,
  nama                TEXT NOT NULL UNIQUE,
  jenis               TEXT,
  icon                TEXT,
  jam_mulai           TEXT,
  jam_selesai         TEXT,
  waktu               TEXT,
  urutan              INTEGER NOT NULL DEFAULT 0,
  untuk_absensi       INTEGER NOT NULL DEFAULT 0 CHECK (untuk_absensi IN (0, 1)),
  hari_aktif_json     TEXT,
  created_by          TEXT,
  updated_by          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kamar (
  id                  TEXT PRIMARY KEY,
  nama                TEXT NOT NULL UNIQUE,
  kapasitas           INTEGER NOT NULL DEFAULT 4,
  lantai              TEXT,
  ketua_santri_id     TEXT,
  fasilitas_json      TEXT,
  asrama_id           TEXT,
  created_by          TEXT,
  updated_by          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS santri (
  id                      TEXT PRIMARY KEY,
  nama                    TEXT NOT NULL,
  kelas_id                TEXT NOT NULL REFERENCES kelas(id),
  kamar_id                TEXT REFERENCES kamar(id) ON DELETE SET NULL,
  nomor_wali              TEXT,
  jenis_kelamin           TEXT,
  catatan                 TEXT,
  catatan_medis           TEXT,
  foto                    TEXT,
  include_wa              INTEGER NOT NULL DEFAULT 1 CHECK (include_wa IN (0, 1)),
  jumlah_pelanggaran      INTEGER NOT NULL DEFAULT 0,
  masuk_kamar_sejak       TEXT,
  asal_provinsi_code      TEXT,
  asal_provinsi_nama      TEXT,
  asal_kota_code          TEXT,
  asal_kota_nama          TEXT,
  asal_kecamatan_code     TEXT,
  asal_kecamatan_nama     TEXT,
  asal_desa_code          TEXT,
  asal_desa_nama          TEXT,
  asrama_id               TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT,
  updated_by          TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS penjadwalan (
  id                  TEXT PRIMARY KEY,
  jenis               TEXT NOT NULL,
  tanggal             TEXT NOT NULL,
  mode                TEXT NOT NULL CHECK (mode IN ('santri', 'kamar')),
  assignee_santri_id  TEXT,
  assignee_kamar_id   TEXT,
  assignee_nama       TEXT NOT NULL,
  assignee_detail     TEXT,
  catatan             TEXT,
  generated_at        TEXT NOT NULL,
  generate_batch_id   TEXT,
  created_by          TEXT,
  updated_by          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (length(trim(assignee_nama)) > 0),
  CHECK (
    (mode = 'santri' AND assignee_santri_id IS NOT NULL AND assignee_kamar_id IS NULL)
    OR
    (mode = 'kamar' AND assignee_kamar_id IS NOT NULL AND assignee_santri_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_penjadwalan_slot
  ON penjadwalan (jenis, tanggal, mode);

CREATE INDEX IF NOT EXISTS idx_penjadwalan_jenis_tanggal
  ON penjadwalan (jenis, tanggal);

CREATE TABLE IF NOT EXISTS penjadwalan_preset (
  id                  TEXT PRIMARY KEY,
  jenis               TEXT NOT NULL UNIQUE,
  mode                TEXT NOT NULL CHECK (mode IN ('santri', 'kamar')),
  mulai               TEXT NOT NULL,
  bulan_ke_depan      INTEGER NOT NULL DEFAULT 1 CHECK (bulan_ke_depan BETWEEN 1 AND 24),
  created_by          TEXT,
  updated_by          TEXT,
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS absensi (
  id              TEXT PRIMARY KEY,
  santri_id       TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  kegiatan_id     TEXT NOT NULL REFERENCES kegiatan(id) ON DELETE RESTRICT,
  tanggal         TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('Hadir', 'Alpa', 'Izin', 'Sakit')),
  catatan         TEXT,
  created_by          TEXT,
  updated_by          TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_absensi_hari
  ON absensi (santri_id, kegiatan_id, tanggal);

CREATE TABLE IF NOT EXISTS izin (
  id                      TEXT PRIMARY KEY,
  santri_id               TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  alasan                  TEXT NOT NULL,
  tanggal_keluar          TEXT NOT NULL,
  batas_kembali           TEXT NOT NULL,
  status_kembali          TEXT NOT NULL DEFAULT 'Belum'
    CHECK (status_kembali IN ('Belum', 'Sudah')),
  penjemput               TEXT,
  waktu_kembali_aktual    TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT,
  updated_by          TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pembinaan (
  id              TEXT PRIMARY KEY,
  santri_id       TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  jenis           TEXT NOT NULL CHECK (jenis IN ('Pelanggaran', 'Teguran')),
  keterangan      TEXT NOT NULL,
  tanggal         TEXT NOT NULL,
  tindak_lanjut   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  created_by          TEXT,
  updated_by          TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS riwayat_kamar (
  id                      TEXT PRIMARY KEY,
  santri_id               TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  kamar_id                TEXT REFERENCES kamar(id) ON DELETE SET NULL,
  kamar_nama              TEXT NOT NULL,
  kamar_sebelumnya_id     TEXT REFERENCES kamar(id) ON DELETE SET NULL,
  kamar_sebelumnya_nama   TEXT,
  tipe                    TEXT NOT NULL CHECK (tipe IN ('masuk', 'pindah', 'keluar', 'ketua')),
  tanggal                 TEXT NOT NULL,
  created_by          TEXT,
  updated_by          TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Settings aplikasi (satu baris)
CREATE TABLE IF NOT EXISTS app_settings (
  id          TEXT PRIMARY KEY CHECK (id = 'default'),
  payload     TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_santri_nama ON santri(nama);
CREATE INDEX IF NOT EXISTS idx_santri_kelas ON santri(kelas_id);
CREATE INDEX IF NOT EXISTS idx_santri_kamar ON santri(kamar_id);
CREATE INDEX IF NOT EXISTS idx_absensi_santri ON absensi(santri_id);
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi(tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_kegiatan ON absensi(kegiatan_id);
CREATE INDEX IF NOT EXISTS idx_penjadwalan_tanggal ON penjadwalan(tanggal);
CREATE INDEX IF NOT EXISTS idx_izin_santri ON izin(santri_id);
CREATE INDEX IF NOT EXISTS idx_pembinaan_santri ON pembinaan(santri_id);
CREATE INDEX IF NOT EXISTS idx_riwayat_santri ON riwayat_kamar(santri_id);

CREATE INDEX IF NOT EXISTS idx_kelas_updated ON kelas(updated_at);
CREATE INDEX IF NOT EXISTS idx_kegiatan_updated ON kegiatan(updated_at);
CREATE INDEX IF NOT EXISTS idx_kamar_updated ON kamar(updated_at);
CREATE INDEX IF NOT EXISTS idx_santri_updated ON santri(updated_at);
CREATE INDEX IF NOT EXISTS idx_penjadwalan_updated ON penjadwalan(updated_at);
CREATE INDEX IF NOT EXISTS idx_absensi_updated ON absensi(updated_at);
CREATE INDEX IF NOT EXISTS idx_izin_updated ON izin(updated_at);
CREATE INDEX IF NOT EXISTS idx_pembinaan_updated ON pembinaan(updated_at);
CREATE INDEX IF NOT EXISTS idx_riwayat_updated ON riwayat_kamar(updated_at);

-- Pembayaran santri (tagihan dinamis + cicilan) — aditif, aman di DB live
CREATE TABLE IF NOT EXISTS tagihan_jenis (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  nominal_default INTEGER NOT NULL DEFAULT 0,
  periode_jenis TEXT NOT NULL DEFAULT 'bulanan',
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tagihan (
  id TEXT PRIMARY KEY,
  santri_id TEXT NOT NULL,
  jenis_id TEXT,
  nama_jenis TEXT NOT NULL DEFAULT '',
  periode TEXT NOT NULL DEFAULT '',
  nominal INTEGER NOT NULL DEFAULT 0,
  terbayar INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'belum',
  jatuh_tempo TEXT,
  catatan TEXT,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (santri_id, jenis_id, periode)
);

CREATE TABLE IF NOT EXISTS pembayaran (
  id TEXT PRIMARY KEY,
  tagihan_id TEXT NOT NULL,
  santri_id TEXT NOT NULL,
  jumlah INTEGER NOT NULL DEFAULT 0,
  tanggal TEXT NOT NULL,
  catatan TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tagihan_santri ON tagihan(santri_id);
CREATE INDEX IF NOT EXISTS idx_tagihan_periode ON tagihan(periode);
CREATE INDEX IF NOT EXISTS idx_pembayaran_tagihan ON pembayaran(tagihan_id);
