-- Snapshot sync lintas platform (Web / Electron / Android)
-- APPLY MANUALLY jika belum ada.
-- Satu baris JSON berisi seluruh data operasional + settings.

CREATE TABLE IF NOT EXISTS app_data_snapshot (
  id         TEXT PRIMARY KEY CHECK (id = 'default'),
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
