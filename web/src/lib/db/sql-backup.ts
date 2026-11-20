import { getSqlConnection, runSqlExclusive, shouldPersistToSqlite } from '@/lib/offline-db';

export const SQL_BACKUP_MARKER = '-- AsramaManager SQL Backup v1';

/** Urutan hapus (anak → induk) lalu isi ulang (induk → anak). */
const BACKUP_TABLES = [
  'kelas',
  'kegiatan',
  'kamar',
  'santri',
  'penjadwalan_preset',
  'penjadwalan',
  'absensi',
  'izin',
  'pembinaan',
  'riwayat_kamar',
  'kv_store',
  'app_meta',
] as const;

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const s = String(value);
  return `'${s.replace(/'/g, "''")}'`;
}

function isSqlBackupFile(text: string): boolean {
  const head = text.trimStart().slice(0, 200);
  return head.includes(SQL_BACKUP_MARKER) || head.includes('AsramaManager SQL Backup');
}

export function looksLikeSqlBackup(text: string, filename?: string): boolean {
  if (filename && /\.sql$/i.test(filename)) return true;
  return isSqlBackupFile(text);
}

export async function exportDatabaseAsSql(): Promise<string> {
  if (!shouldPersistToSqlite()) {
    throw new Error('Ekspor SQL hanya tersedia di aplikasi Android.');
  }

  const db = await getSqlConnection();
  const lines: string[] = [
    SQL_BACKUP_MARKER,
    `-- Generated: ${new Date().toISOString()}`,
    'PRAGMA foreign_keys=OFF;',
    'BEGIN TRANSACTION;',
  ];

  for (const table of [...BACKUP_TABLES].reverse()) {
    lines.push(`DELETE FROM ${table};`);
  }

  for (const table of BACKUP_TABLES) {
    const res = await db.query(`SELECT * FROM ${table}`);
    const rows = res.values ?? [];
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0] as object);
    const colList = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const vals = columns.map((c) => sqlLiteral(r[c])).join(', ');
      lines.push(`INSERT INTO ${table} (${colList}) VALUES (${vals});`);
    }
  }

  lines.push('COMMIT;', 'PRAGMA foreign_keys=ON;');
  return lines.join('\n');
}

export async function importDatabaseFromSql(script: string): Promise<void> {
  if (!shouldPersistToSqlite()) {
    throw new Error('Impor SQL hanya tersedia di aplikasi Android.');
  }
  const trimmed = script.trim();
  if (!trimmed) throw new Error('Berkas SQL kosong.');
  if (!isSqlBackupFile(trimmed) && !/^\s*PRAGMA/i.test(trimmed) && !/^\s*BEGIN/i.test(trimmed)) {
    throw new Error('Bukan cadangan SQL Asrama Manager yang valid.');
  }

  await runSqlExclusive(async (db) => {
    await db.execute('PRAGMA foreign_keys=OFF;', false);
    await db.execute(trimmed, true);
    await db.execute('PRAGMA foreign_keys=ON;', false);
  });
}
