# AsramaPersonal — Web + Android (Turso Sync)

Local-first: SQLite di web (jeep-sqlite) dan Android. Sync batch ke **Turso Cloud** (`asrama`) saat online.

## Struktur

```
web/        # React + Vite + client-api + sync
android/    # Capacitor Android
sql/        # DDL Turso — apply manual, jangan auto-migrate production
```

## Setup (Windows)

1. `npm install`
2. Salin `web/.env.example` → `web/.env`, isi token Turso:
   ```
   VITE_TURSO_DATABASE_URL=libsql://asrama-nazrul-dev.aws-ap-northeast-1.turso.io
   VITE_TURSO_AUTH_TOKEN=...
   ```
3. Apply SQL ke Turso (manual): `sql/001_schema_v4.sql` lalu `sql/002_sync_meta.sql`
4. Web browser: `npm run dev` → http://localhost:5180
5. Desktop Electron (dev): jalankan `npm run dev`, terminal lain `npm run electron:dev`
6. Installer Windows: `npm run electron:build` → file di `release/`
7. Android: `npm run build:apk`

## Sync (Web + Electron + Android)

- Satu sumber cloud: tabel Turso `app_data_snapshot` (JSON penuh).
- Lokal: Android = SQLite, Web/Electron = localStorage.
- Auto sync saat online / buka app / tiap 2 menit + tombol **Sync sekarang**.
- Konflik: last-write-wins (`updated_at` snapshot).
- Schema cloud: `sql/001`–`003` (sudah perlu terpasang di DB `asrama`).
