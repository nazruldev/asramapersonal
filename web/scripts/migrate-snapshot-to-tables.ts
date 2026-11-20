/**
 * One-shot: isi tabel entity Turso dari app_data_snapshot (jika tabel masih kosong).
 * Jalankan: cd web && npx tsx scripts/migrate-snapshot-to-tables.ts
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  countTursoOperationalRows,
  writeSnapshotToTursoTables,
} from '../src/lib/sync/turso-relational';
import type { OfflineDbSnapshot } from '../src/lib/db/snapshot-types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const url = process.env.VITE_TURSO_DATABASE_URL?.trim();
  const authToken = process.env.VITE_TURSO_AUTH_TOKEN?.trim();
  if (!url || !authToken) throw new Error('VITE_TURSO_* missing in web/.env');

  const client = createClient({ url, authToken });
  const counts = await countTursoOperationalRows(client);
  console.log('Before:', counts);

  const remote = await client.execute(
    `SELECT payload FROM app_data_snapshot WHERE id = 'default' LIMIT 1`
  );
  const payload = remote.rows[0]?.payload ? String(remote.rows[0].payload) : '';
  if (!payload) throw new Error('app_data_snapshot kosong');

  const snap = JSON.parse(payload) as OfflineDbSnapshot;
  await writeSnapshotToTursoTables(client, snap);

  const after = await countTursoOperationalRows(client);
  console.log('After:', after);
  console.log('OK — data sudah di tabel entity');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
