-- Sync helpers for Turso Cloud (asrama)
-- APPLY MANUALLY after 001_schema_v4.sql — do not auto-run against production.
--
-- Tombstone: baris yang dihapus di perangkat, di-push ke cloud agar perangkat lain ikut menghapus.
-- sync_meta di cloud opsional (perangkat menyimpan last_pulled_at di SQLite lokal).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sync_tombstone (
  table_name   TEXT NOT NULL,
  row_id       TEXT NOT NULL,
  deleted_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (table_name, row_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_tombstone_deleted
  ON sync_tombstone (deleted_at);

-- Catatan opsional di cloud (mis. audit); client utama pakai app_meta lokal.
CREATE TABLE IF NOT EXISTS sync_meta (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
