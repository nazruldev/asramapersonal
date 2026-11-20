# SQL Turso Cloud (`asrama`)

File di folder ini **tidak dijalankan otomatis** ke production.

## Apply manual

1. Buka Turso dashboard / CLI untuk database `asrama`.
2. Jalankan berurutan:
   - `001_schema_v4.sql`
   - `002_sync_meta.sql`
3. Atau di Windows: `powershell -File sql/apply-manual.ps1`
4. Review hasil (`SELECT name FROM sqlite_master WHERE type='table'`).

## Env aplikasi

```
TURSO_DATABASE_URL=libsql://asrama-nazrul-dev.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=<token dari turso db tokens create asrama>
```

Untuk Vite/client sync, salin juga sebagai `VITE_TURSO_DATABASE_URL` dan `VITE_TURSO_AUTH_TOKEN`.
