-- Migrasi multi-asrama: kolom asrama_id pada santri & kamar.
-- APPLY MANUALLY untuk DB Turso yang sudah ada (abaikan error "duplicate column").
-- Daftar asrama & akun pengguna disimpan di payload app_settings (sinkron otomatis).

ALTER TABLE kamar ADD COLUMN asrama_id TEXT;
ALTER TABLE santri ADD COLUMN asrama_id TEXT;

CREATE INDEX IF NOT EXISTS idx_santri_asrama ON santri(asrama_id);
CREATE INDEX IF NOT EXISTS idx_kamar_asrama ON kamar(asrama_id);
