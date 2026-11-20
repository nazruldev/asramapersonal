/**
 * jeep-sqlite / sql.js WASM bentrok dengan Vite (LinkError).
 * Web sengaja tidak mengaktifkan SQLite — pakai localStorage.
 * SQLite aktif hanya di Android/iOS via Capacitor plugin.
 */
export function initWebSqlite(): Promise<boolean> {
  return Promise.resolve(false);
}
