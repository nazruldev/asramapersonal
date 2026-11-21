-- Manual migration (production-safe): tabel pembayaran / tagihan di Turso.
-- Aman dijalankan ulang (IF NOT EXISTS). Tidak mengubah data yang sudah ada.
-- Jalankan di Turso SQL editor DB `asrama`, atau via sql/apply-manual.ps1

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

CREATE INDEX IF NOT EXISTS idx_tagihan_santri ON tagihan (santri_id);
CREATE INDEX IF NOT EXISTS idx_tagihan_periode ON tagihan (periode);
CREATE INDEX IF NOT EXISTS idx_pembayaran_tagihan ON pembayaran (tagihan_id);
