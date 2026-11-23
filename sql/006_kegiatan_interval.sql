-- Frekuensi kegiatan dinamis (setiap N minggu + tanggal acuan).
-- APPLY MANUALLY untuk DB Turso yang sudah ada (abaikan error "duplicate column").

ALTER TABLE kegiatan ADD COLUMN interval_minggu INTEGER NOT NULL DEFAULT 1;
ALTER TABLE kegiatan ADD COLUMN acuan_tanggal TEXT;
