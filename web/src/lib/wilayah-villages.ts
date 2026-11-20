import initSqlJs, { type Database } from 'sql.js';

let dbPromise: Promise<Database> | null = null;

function resolveSqliteUrl(): string {
  if (typeof window !== 'undefined') {
    const base = import.meta.env.BASE_URL ?? './';
    const normalized = base.endsWith('/') ? base : `${base}/`;
    return `${normalized}wilyah.sqlite`;
  }
  return '';
}

async function openWilayahDatabase(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file) => {
      if (typeof window !== 'undefined') {
        const base = import.meta.env.BASE_URL ?? './';
        const normalized = base.endsWith('/') ? base : `${base}/`;
        return `${normalized}${file}`;
      }
      return file;
    },
  });

  if (typeof window !== 'undefined') {
    const url = resolveSqliteUrl();
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('WILAYAH_SQLITE_MISSING');
    }
    const buf = await res.arrayBuffer();
    return new SQL.Database(new Uint8Array(buf));
  }

  const fs = await import('fs');
  const path = await import('path');
  const candidates = [
    path.resolve(process.cwd(), 'public/wilyah.sqlite'),
    path.resolve(process.cwd(), 'wilyah.sqlite'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('WILAYAH_SQLITE_MISSING');
  }
  return new SQL.Database(fs.readFileSync(found));
}

export async function getWilayahSqliteDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = openWilayahDatabase();
  }
  return dbPromise;
}

import type { WilayahListItem } from '@/lib/wilayah-types';

export async function searchVillages(
  subDistrictCode: string,
  q?: string,
  limit = 60
): Promise<WilayahListItem[]> {
  let db: Database;
  try {
    db = await getWilayahSqliteDb();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'WILAYAH_SQLITE_MISSING') return [];
    throw e;
  }
  const nq = (q ?? '').trim().toLowerCase();
  const code = String(subDistrictCode);
  const cap = Math.min(Math.max(limit, 1), 100);

  const stmt = db.prepare(
    `SELECT village_code, village_name FROM villages
     WHERE village_sub_district_code = ?
     ORDER BY village_name
     LIMIT ?`
  );
  stmt.bind([Number(code), cap * 3]);

  const out: WilayahListItem[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { village_code: number; village_name: string };
    const name = String(row.village_name ?? '');
    if (nq && !name.toLowerCase().includes(nq)) continue;
    out.push({ code: String(row.village_code), name });
    if (out.length >= cap) break;
  }
  stmt.free();

  if (nq && out.length < cap) {
    const stmt2 = db.prepare(
      `SELECT village_code, village_name FROM villages
       WHERE village_sub_district_code = ? AND LOWER(village_name) LIKE ?
       ORDER BY village_name
       LIMIT ?`
    );
    stmt2.bind([Number(code), `%${nq}%`, cap]);
    const filtered: WilayahListItem[] = [];
    while (stmt2.step()) {
      const row = stmt2.getAsObject() as { village_code: number; village_name: string };
      filtered.push({ code: String(row.village_code), name: String(row.village_name ?? '') });
    }
    stmt2.free();
    return filtered;
  }

  return out;
}
