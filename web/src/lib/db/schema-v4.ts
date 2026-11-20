/** DDL entitas bisnis schema v4 (SQLite). Meta: app_meta + kv_store di offline-db. */

export const SCHEMA_V4_SQL = `
  CREATE TABLE IF NOT EXISTS kelas (
    id          TEXT PRIMARY KEY,
    nama        TEXT NOT NULL,
    tingkat     TEXT NOT NULL CHECK (tingkat IN ('MTS', 'ALIYAH')),
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
    hari_aktif_json     TEXT
  );

  CREATE TABLE IF NOT EXISTS kamar (
    id                  TEXT PRIMARY KEY,
    nama                TEXT NOT NULL UNIQUE,
    kapasitas           INTEGER NOT NULL DEFAULT 4,
    lantai              TEXT,
    ketua_santri_id     TEXT,
    fasilitas_json      TEXT,
    asrama_id           TEXT
  );

  CREATE TABLE IF NOT EXISTS santri (
    id                      TEXT PRIMARY KEY,
    nama                    TEXT NOT NULL,
    kelas_id                TEXT NOT NULL REFERENCES kelas(id),
    kamar_id                TEXT REFERENCES kamar(id) ON DELETE SET NULL,
    nomor_wali              TEXT,
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
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TRIGGER IF NOT EXISTS trg_kamar_ketua_ins
  BEFORE INSERT ON kamar
  WHEN NEW.ketua_santri_id IS NOT NULL
  BEGIN
    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM santri s
        WHERE s.id = NEW.ketua_santri_id AND s.kamar_id = NEW.id
      ) THEN RAISE(ABORT, 'ketua harus santri di kamar ini')
    END;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_kamar_ketua_upd
  BEFORE UPDATE OF ketua_santri_id ON kamar
  WHEN NEW.ketua_santri_id IS NOT NULL
  BEGIN
    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM santri s
        WHERE s.id = NEW.ketua_santri_id AND s.kamar_id = NEW.id
      ) THEN RAISE(ABORT, 'ketua harus santri di kamar ini')
    END;
  END;

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
    updated_at          TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS absensi (
    id              TEXT PRIMARY KEY,
    santri_id       TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    kegiatan_id     TEXT NOT NULL REFERENCES kegiatan(id) ON DELETE RESTRICT,
    tanggal         TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('Hadir', 'Alpa', 'Izin', 'Sakit')),
    catatan         TEXT
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
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pembinaan (
    id              TEXT PRIMARY KEY,
    santri_id       TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    jenis           TEXT NOT NULL CHECK (jenis IN ('Pelanggaran', 'Teguran')),
    keterangan      TEXT NOT NULL,
    tanggal         TEXT NOT NULL,
    tindak_lanjut   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS riwayat_kamar (
    id                      TEXT PRIMARY KEY,
    santri_id               TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    kamar_id                TEXT REFERENCES kamar(id) ON DELETE SET NULL,
    kamar_nama              TEXT NOT NULL,
    kamar_sebelumnya_id     TEXT REFERENCES kamar(id) ON DELETE SET NULL,
    kamar_sebelumnya_nama   TEXT,
    tipe                    TEXT NOT NULL CHECK (tipe IN ('masuk', 'pindah', 'keluar', 'ketua')),
    tanggal                 TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tagihan_jenis (
    id                  TEXT PRIMARY KEY,
    nama                TEXT NOT NULL,
    nominal_default     INTEGER NOT NULL DEFAULT 0,
    periode_jenis       TEXT NOT NULL DEFAULT 'bulanan'
      CHECK (periode_jenis IN ('bulanan', 'sekali', 'bebas')),
    aktif               INTEGER NOT NULL DEFAULT 1 CHECK (aktif IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tagihan (
    id              TEXT PRIMARY KEY,
    santri_id       TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    jenis_id        TEXT REFERENCES tagihan_jenis(id) ON DELETE SET NULL,
    nama_jenis      TEXT NOT NULL DEFAULT '',
    periode         TEXT NOT NULL DEFAULT '',
    nominal         INTEGER NOT NULL DEFAULT 0,
    terbayar        INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'belum'
      CHECK (status IN ('belum', 'sebagian', 'lunas')),
    jatuh_tempo     TEXT,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (santri_id, jenis_id, periode)
  );

  CREATE INDEX IF NOT EXISTS idx_tagihan_santri ON tagihan (santri_id);
  CREATE INDEX IF NOT EXISTS idx_tagihan_periode ON tagihan (periode);

  CREATE TABLE IF NOT EXISTS pembayaran (
    id              TEXT PRIMARY KEY,
    tagihan_id      TEXT NOT NULL REFERENCES tagihan(id) ON DELETE CASCADE,
    santri_id       TEXT NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
    jumlah          INTEGER NOT NULL DEFAULT 0,
    tanggal         TEXT NOT NULL,
    catatan         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_pembayaran_tagihan ON pembayaran (tagihan_id);

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
`;

export const DROP_ENTITY_TABLES_V4_SQL = `
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
