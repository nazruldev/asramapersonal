/**
 * Store pembayaran santri (tagihan dinamis + cicilan).
 *
 * Direct Turso: setiap baca pull dari cloud; setiap mutasi flush ke cloud.
 * localStorage hanya cache kerja sementara, bukan sumber kebenaran.
 */
import { createClient, type Client, type InStatement } from '@libsql/client/web';
import {
  initOfflineSqlite,
  runSqlExclusive,
  shouldPersistToSqlite,
} from './offline-db';

export type TagihanJenisPeriode = 'bulanan' | 'sekali' | 'bebas';

export type TagihanJenis = {
  id: string;
  nama: string;
  nominal_default: number;
  periode_jenis: TagihanJenisPeriode;
  aktif: boolean;
  created_at?: string;
  updated_at?: string;
};

export type TagihanStatus = 'belum' | 'sebagian' | 'lunas';

export type TagihanRow = {
  id: string;
  santri_id: string;
  jenis_id: string | null;
  nama_jenis: string;
  periode: string;
  nominal: number;
  terbayar: number;
  status: TagihanStatus;
  jatuh_tempo?: string;
  catatan?: string;
  created_at?: string;
  updated_at?: string;
};

export type PembayaranTransaksi = {
  id: string;
  tagihan_id: string;
  santri_id: string;
  jumlah: number;
  tanggal: string;
  catatan?: string;
  created_at?: string;
};

export type TagihanFilter = {
  periode?: string;
  jenis_id?: string;
  santri_id?: string;
  status?: TagihanStatus;
};

export type GenerateTagihanInput = {
  jenis: TagihanJenis;
  periode: string;
  santriIds: string[];
  jatuhTempo?: string;
  nominalOverride?: number;
  nominalPerSantri?: Record<string, number>;
};

export type GenerateTagihanResult = { created: number; skipped: number };

const LS_KEY = 'asrama_pembayaran_db';
const PERIODE_JENIS: TagihanJenisPeriode[] = ['bulanan', 'sekali', 'bebas'];

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const nowIso = () => new Date().toISOString();

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function statusOf(nominal: number, terbayar: number): TagihanStatus {
  if (terbayar >= nominal && nominal > 0) return 'lunas';
  if (terbayar > 0) return 'sebagian';
  return 'belum';
}

export function sisaTagihan(t: Pick<TagihanRow, 'nominal' | 'terbayar'>): number {
  return Math.max(0, num(t.nominal) - num(t.terbayar));
}

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Jatuh tempo efektif: field tagihan, atau akhir bulan periode. */
export function effectiveJatuhTempo(
  t: Pick<TagihanRow, 'jatuh_tempo' | 'periode'>
): string | null {
  const jt = (t.jatuh_tempo || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(jt)) return jt;
  const m = (t.periode || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const last = new Date(Number(m[1]), Number(m[2]), 0);
  const y = last.getFullYear();
  const mo = String(last.getMonth() + 1).padStart(2, '0');
  const day = String(last.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Tunggakan = masih ada sisa DAN sudah lewat jatuh tempo. */
export function isTagihanTunggakan(
  t: Pick<TagihanRow, 'nominal' | 'terbayar' | 'jatuh_tempo' | 'periode'>,
  today = todayYmdLocal()
): boolean {
  if (sisaTagihan(t) <= 0) return false;
  const due = effectiveJatuhTempo(t);
  if (!due) return false;
  return due < today;
}

// ——— localStorage (web / electron tanpa sqlite) ———

type LsState = {
  tagihan_jenis: TagihanJenis[];
  tagihan: TagihanRow[];
  pembayaran: PembayaranTransaksi[];
};

function lsRead(): LsState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { tagihan_jenis: [], tagihan: [], pembayaran: [] };
    const p = JSON.parse(raw) as Partial<LsState>;
    return {
      tagihan_jenis: Array.isArray(p.tagihan_jenis) ? p.tagihan_jenis : [],
      tagihan: Array.isArray(p.tagihan) ? p.tagihan : [],
      pembayaran: Array.isArray(p.pembayaran) ? p.pembayaran : [],
    };
  } catch {
    return { tagihan_jenis: [], tagihan: [], pembayaran: [] };
  }
}

function lsWrite(state: LsState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// ——— row mapping sqlite ———

function mapJenis(r: Record<string, unknown>): TagihanJenis {
  return {
    id: String(r.id),
    nama: String(r.nama ?? ''),
    nominal_default: num(r.nominal_default),
    periode_jenis: PERIODE_JENIS.includes(r.periode_jenis as TagihanJenisPeriode)
      ? (r.periode_jenis as TagihanJenisPeriode)
      : 'bulanan',
    aktif: !(r.aktif === 0 || r.aktif === 0n),
    created_at: r.created_at ? String(r.created_at) : undefined,
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
  };
}

function mapTagihan(r: Record<string, unknown>): TagihanRow {
  const nominal = num(r.nominal);
  const terbayar = num(r.terbayar);
  const status = ['belum', 'sebagian', 'lunas'].includes(String(r.status))
    ? (r.status as TagihanStatus)
    : statusOf(nominal, terbayar);
  return {
    id: String(r.id),
    santri_id: String(r.santri_id),
    jenis_id: r.jenis_id ? String(r.jenis_id) : null,
    nama_jenis: String(r.nama_jenis ?? ''),
    periode: String(r.periode ?? ''),
    nominal,
    terbayar,
    status,
    jatuh_tempo: r.jatuh_tempo ? String(r.jatuh_tempo) : undefined,
    catatan: r.catatan ? String(r.catatan) : undefined,
    created_at: r.created_at ? String(r.created_at) : undefined,
    updated_at: r.updated_at ? String(r.updated_at) : undefined,
  };
}

function mapTransaksi(r: Record<string, unknown>): PembayaranTransaksi {
  return {
    id: String(r.id),
    tagihan_id: String(r.tagihan_id),
    santri_id: String(r.santri_id),
    jumlah: num(r.jumlah),
    tanggal: String(r.tanggal ?? ''),
    catatan: r.catatan ? String(r.catatan) : undefined,
    created_at: r.created_at ? String(r.created_at) : undefined,
  };
}

/** Selama push, jangan pull-live (akan menimpa mutasi lokal yang belum terkirim). */
let suppressLivePull = false;

/** Direct Turso: wajib pull live sebelum baca/mutasi lokal. */
async function ensurePembayaranLiveFromTurso(): Promise<void> {
  if (suppressLivePull) return;
  if (!isPembayaranSyncConfigured()) {
    throw new Error('Turso wajib untuk pembayaran');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Tidak ada internet. Aplikasi wajib online ke Turso.');
  }
  await pullPembayaranFromTurso();
}

// ——— CRUD: jenis ———

export async function listTagihanJenis(): Promise<TagihanJenis[]> {
  if (isPembayaranSyncConfigured()) {
    await ensurePembayaranLiveFromTurso();
  }
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    return runSqlExclusive(async (db) => {
      const res = await db.query(`SELECT * FROM tagihan_jenis ORDER BY nama COLLATE NOCASE`);
      return (res.values ?? []).map((r) => mapJenis(r as Record<string, unknown>));
    });
  }
  return [...lsRead().tagihan_jenis].sort((a, b) => a.nama.localeCompare(b.nama));
}

export async function upsertTagihanJenis(
  input: Omit<TagihanJenis, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<TagihanJenis> {
  if (isPembayaranSyncConfigured()) await ensurePembayaranLiveFromTurso();
  const row: TagihanJenis = {
    id: input.id || newId(),
    nama: input.nama.trim(),
    nominal_default: Math.max(0, Math.floor(num(input.nominal_default))),
    periode_jenis: PERIODE_JENIS.includes(input.periode_jenis)
      ? input.periode_jenis
      : 'bulanan',
    aktif: input.aktif !== false,
    updated_at: nowIso(),
  };

  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    await runSqlExclusive(async (db) => {
      await db.run(
        `INSERT INTO tagihan_jenis (id, nama, nominal_default, periode_jenis, aktif, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           nama=excluded.nama, nominal_default=excluded.nominal_default,
           periode_jenis=excluded.periode_jenis, aktif=excluded.aktif,
           updated_at=excluded.updated_at`,
        [row.id, row.nama, row.nominal_default, row.periode_jenis, row.aktif ? 1 : 0, row.updated_at]
      );
      // nama_jenis di tagihan ikut diperbarui agar label konsisten
      await db.run(
        `UPDATE tagihan SET nama_jenis = ?, updated_at = ? WHERE jenis_id = ?`,
        [row.nama, row.updated_at, row.id]
      );
    });
  } else {
    const st = lsRead();
    const idx = st.tagihan_jenis.findIndex((j) => j.id === row.id);
    if (idx >= 0) st.tagihan_jenis[idx] = { ...st.tagihan_jenis[idx], ...row };
    else st.tagihan_jenis.push({ ...row, created_at: nowIso() });
    for (const t of st.tagihan) if (t.jenis_id === row.id) t.nama_jenis = row.nama;
    lsWrite(st);
  }
  console.debug('[pembayaran] upsertTagihanJenis selesai lokal, push ke Turso…', row.id);
  await flushPembayaranToTurso();
  console.debug('[pembayaran] push jenis OK', row.id);
  return row;
}

export async function deleteTagihanJenis(id: string): Promise<void> {
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    await runSqlExclusive(async (db) => {
      await db.run(`UPDATE tagihan SET jenis_id = NULL WHERE jenis_id = ?`, [id]);
      await db.run(`DELETE FROM tagihan_jenis WHERE id = ?`, [id]);
    });
  } else {
    const st = lsRead();
    st.tagihan_jenis = st.tagihan_jenis.filter((j) => j.id !== id);
    for (const t of st.tagihan) if (t.jenis_id === id) t.jenis_id = null;
    lsWrite(st);
  }
  await flushPembayaranToTurso();
}

// ——— CRUD: tagihan ———

function tagihanWhere(filter?: TagihanFilter): { clause: string; args: string[] } {
  const parts: string[] = [];
  const args: string[] = [];
  if (filter?.periode) {
    parts.push('periode = ?');
    args.push(filter.periode);
  }
  if (filter?.jenis_id) {
    parts.push('jenis_id = ?');
    args.push(filter.jenis_id);
  }
  if (filter?.santri_id) {
    parts.push('santri_id = ?');
    args.push(filter.santri_id);
  }
  if (filter?.status) {
    parts.push('status = ?');
    args.push(filter.status);
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', args };
}

function matchTagihanFilter(t: TagihanRow, filter?: TagihanFilter): boolean {
  if (!filter) return true;
  if (filter.periode && t.periode !== filter.periode) return false;
  if (filter.jenis_id && t.jenis_id !== filter.jenis_id) return false;
  if (filter.santri_id && t.santri_id !== filter.santri_id) return false;
  if (filter.status && t.status !== filter.status) return false;
  return true;
}

export async function listTagihan(filter?: TagihanFilter): Promise<TagihanRow[]> {
  if (isPembayaranSyncConfigured()) {
    await ensurePembayaranLiveFromTurso();
  }
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    return runSqlExclusive(async (db) => {
      const { clause, args } = tagihanWhere(filter);
      const res = await db.query(
        `SELECT * FROM tagihan ${clause} ORDER BY periode DESC, created_at DESC`,
        args
      );
      return (res.values ?? []).map((r) => mapTagihan(r as Record<string, unknown>));
    });
  }
  return lsRead()
    .tagihan.filter((t) => matchTagihanFilter(t, filter))
    .sort((a, b) =>
      `${b.periode}|${b.created_at ?? ''}`.localeCompare(`${a.periode}|${a.created_at ?? ''}`)
    );
}

export async function getTagihan(id: string): Promise<TagihanRow | null> {
  const rows = await listTagihan();
  return rows.find((t) => t.id === id) ?? null;
}

/**
 * Generate tagihan massal.
 * Unik per (santri + jenis + periode): baris yang sudah ada DILewati (INSERT OR IGNORE),
 * TIDAK di-update / replace — jadi terbayar & riwayat cicilan tetap aman jika dijalankan ulang.
 */
export async function generateTagihan(
  input: GenerateTagihanInput
): Promise<GenerateTagihanResult> {
  if (isPembayaranSyncConfigured()) await ensurePembayaranLiveFromTurso();
  const jenis = input.jenis;
  const periode = input.periode.trim();
  const baseNominal =
    input.nominalOverride != null
      ? Math.max(0, Math.floor(num(input.nominalOverride)))
      : jenis.nominal_default;
  const rows: TagihanRow[] = input.santriIds.map((sid) => ({
    id: newId(),
    santri_id: sid,
    jenis_id: jenis.id,
    nama_jenis: jenis.nama,
    periode,
    nominal: Math.max(
      0,
      Math.floor(num(input.nominalPerSantri?.[sid] ?? baseNominal))
    ),
    terbayar: 0,
    status: 'belum',
    jatuh_tempo: input.jatuhTempo || undefined,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));
  if (!rows.length) return { created: 0, skipped: 0 };

  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    return runSqlExclusive(async (db) => {
      const santriRes = await db.query(`SELECT id FROM santri`);
      const valid = new Set((resIds(santriRes.values) ?? []).map(String));
      let created = 0;
      let skipped = 0;
      for (const t of rows) {
        if (!valid.has(t.santri_id)) {
          skipped += 1;
          continue;
        }
        const r = await db.run(
          `INSERT OR IGNORE INTO tagihan (
            id, santri_id, jenis_id, nama_jenis, periode, nominal, terbayar,
            status, jatuh_tempo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 'belum', ?, ?, ?)`,
          [
            t.id, t.santri_id, t.jenis_id, t.nama_jenis, t.periode, t.nominal,
            t.jatuh_tempo ?? null, t.created_at, t.updated_at,
          ]
        );
        if ((r.changes?.changes ?? 0) > 0) created += 1;
        else skipped += 1;
      }
      await flushPembayaranToTurso();
      return { created, skipped };
    });
  }

  const st = lsRead();
  const exists = new Set(st.tagihan.map((t) => `${t.santri_id}|${t.jenis_id}|${t.periode}`));
  let created = 0;
  let skipped = 0;
  for (const t of rows) {
    const key = `${t.santri_id}|${t.jenis_id}|${t.periode}`;
    if (exists.has(key)) {
      skipped += 1;
      continue;
    }
    st.tagihan.push(t);
    exists.add(key);
    created += 1;
  }
  lsWrite(st);
  await flushPembayaranToTurso();
  return { created, skipped };
}

function resIds(values: unknown): unknown[] | null {
  return Array.isArray(values) ? values : null;
}

export async function updateTagihan(
  id: string,
  patch: { nominal?: number; jatuh_tempo?: string | null; catatan?: string | null }
): Promise<TagihanRow | null> {
  const apply = (t: TagihanRow): TagihanRow => {
    const next = { ...t, updated_at: nowIso() };
    if (patch.nominal !== undefined) next.nominal = Math.max(0, Math.floor(num(patch.nominal)));
    if (patch.jatuh_tempo !== undefined) next.jatuh_tempo = patch.jatuh_tempo || undefined;
    if (patch.catatan !== undefined) next.catatan = patch.catatan || undefined;
    next.status = statusOf(next.nominal, next.terbayar);
    return next;
  };

  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    return runSqlExclusive(async (db) => {
      const cur = await db.query(`SELECT * FROM tagihan WHERE id = ?`, [id]);
      const row = cur.values?.[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      const next = apply(mapTagihan(row));
      await db.run(
        `UPDATE tagihan SET nominal = ?, jatuh_tempo = ?, catatan = ?, status = ?, updated_at = ?
         WHERE id = ?`,
        [next.nominal, next.jatuh_tempo ?? null, next.catatan ?? null, next.status, next.updated_at, id]
      );
      await flushPembayaranToTurso();
      return next;
    });
  }

  const st = lsRead();
  const idx = st.tagihan.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  st.tagihan[idx] = apply(st.tagihan[idx]);
  const next = st.tagihan[idx];
  lsWrite(st);
  await flushPembayaranToTurso();
  return next;
}

export async function deleteTagihan(id: string): Promise<void> {
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    await runSqlExclusive(async (db) => {
      await db.run(`DELETE FROM pembayaran WHERE tagihan_id = ?`, [id]);
      await db.run(`DELETE FROM tagihan WHERE id = ?`, [id]);
    });
  } else {
    const st = lsRead();
    st.tagihan = st.tagihan.filter((t) => t.id !== id);
    st.pembayaran = st.pembayaran.filter((p) => p.tagihan_id !== id);
    lsWrite(st);
  }
  await flushPembayaranToTurso();
}

// ——— Transaksi / cicilan ———

async function recountTagihanTerbayar(tagihanId: string): Promise<void> {
  if (shouldPersistToSqlite()) {
    await runSqlExclusive(async (db) => {
      const sum = await db.query(
        `SELECT COALESCE(SUM(jumlah), 0) AS total FROM pembayaran WHERE tagihan_id = ?`,
        [tagihanId]
      );
      const terbayar = num((sum.values?.[0] as { total?: number })?.total);
      const cur = await db.query(`SELECT nominal FROM tagihan WHERE id = ?`, [tagihanId]);
      const nominal = num((cur.values?.[0] as { nominal?: number })?.nominal);
      await db.run(`UPDATE tagihan SET terbayar = ?, status = ?, updated_at = ? WHERE id = ?`, [
        terbayar,
        statusOf(nominal, terbayar),
        nowIso(),
        tagihanId,
      ]);
    });
  }
}

export async function listTransaksi(tagihanId: string): Promise<PembayaranTransaksi[]> {
  if (isPembayaranSyncConfigured()) await ensurePembayaranLiveFromTurso();
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    return runSqlExclusive(async (db) => {
      const res = await db.query(
        `SELECT * FROM pembayaran WHERE tagihan_id = ? ORDER BY tanggal DESC, created_at DESC`,
        [tagihanId]
      );
      return (res.values ?? []).map((r) => mapTransaksi(r as Record<string, unknown>));
    });
  }
  return lsRead()
    .pembayaran.filter((p) => p.tagihan_id === tagihanId)
    .sort((a, b) => `${b.tanggal}|${b.created_at ?? ''}`.localeCompare(`${a.tanggal}|${a.created_at ?? ''}`));
}

export async function addTransaksi(
  tagihanId: string,
  input: { jumlah: number; tanggal?: string; catatan?: string }
): Promise<PembayaranTransaksi | null | { error: string }> {
  if (isPembayaranSyncConfigured()) await ensurePembayaranLiveFromTurso();
  const jumlah = Math.floor(num(input.jumlah));
  if (jumlah <= 0) return { error: 'Jumlah pembayaran harus lebih dari 0.' };
  const row: PembayaranTransaksi = {
    id: newId(),
    tagihan_id: tagihanId,
    santri_id: '',
    jumlah,
    tanggal: input.tanggal || nowIso().slice(0, 10),
    catatan: input.catatan?.trim() || undefined,
    created_at: nowIso(),
  };

  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    const result = await runSqlExclusive(async (db) => {
      const cur = await db.query(
        `SELECT santri_id, nominal, terbayar FROM tagihan WHERE id = ?`,
        [tagihanId]
      );
      const t = cur.values?.[0] as
        | { santri_id?: string; nominal?: number; terbayar?: number }
        | undefined;
      if (!t?.santri_id) return { ok: false as const, error: 'not_found' as const };
      const sisa = sisaTagihan({
        nominal: num(t.nominal),
        terbayar: num(t.terbayar),
      });
      if (jumlah > sisa) return { ok: false as const, error: 'overpay' as const };
      row.santri_id = String(t.santri_id);
      await db.run(
        `INSERT INTO pembayaran (id, tagihan_id, santri_id, jumlah, tanggal, catatan, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.tagihan_id, row.santri_id, row.jumlah, row.tanggal, row.catatan ?? null, row.created_at]
      );
      return { ok: true as const };
    });
    if (!result.ok) {
      if (result.error === 'overpay') {
        return { error: 'Jumlah melebihi sisa tagihan.' };
      }
      return null;
    }
    await recountTagihanTerbayar(tagihanId);
    await flushPembayaranToTurso();
    return row;
  }

  const st = lsRead();
  const tagihan = st.tagihan.find((t) => t.id === tagihanId);
  if (!tagihan) return null;
  const sisa = sisaTagihan(tagihan);
  if (jumlah > sisa) return { error: 'Jumlah melebihi sisa tagihan.' };
  row.santri_id = tagihan.santri_id;
  st.pembayaran.push(row);
  tagihan.terbayar = st.pembayaran
    .filter((p) => p.tagihan_id === tagihanId)
    .reduce((acc, p) => acc + num(p.jumlah), 0);
  tagihan.status = statusOf(tagihan.nominal, tagihan.terbayar);
  tagihan.updated_at = nowIso();
  lsWrite(st);
  await flushPembayaranToTurso();
  return row;
}

export async function deleteTransaksi(id: string): Promise<void> {
  let tagihanId = '';
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    tagihanId = await runSqlExclusive(async (db) => {
      const cur = await db.query(`SELECT tagihan_id FROM pembayaran WHERE id = ?`, [id]);
      const tid = String((cur.values?.[0] as { tagihan_id?: string })?.tagihan_id ?? '');
      await db.run(`DELETE FROM pembayaran WHERE id = ?`, [id]);
      return tid;
    });
    if (tagihanId) await recountTagihanTerbayar(tagihanId);
  } else {
    const st = lsRead();
    const tx = st.pembayaran.find((p) => p.id === id);
    if (!tx) return;
    tagihanId = tx.tagihan_id;
    st.pembayaran = st.pembayaran.filter((p) => p.id !== id);
    const tagihan = st.tagihan.find((t) => t.id === tagihanId);
    if (tagihan) {
      tagihan.terbayar = st.pembayaran
        .filter((p) => p.tagihan_id === tagihanId)
        .reduce((acc, p) => acc + num(p.jumlah), 0);
      tagihan.status = statusOf(tagihan.nominal, tagihan.terbayar);
      tagihan.updated_at = nowIso();
    }
    lsWrite(st);
  }
  await flushPembayaranToTurso();
}

/**
 * Rekap tunggakan per santri (opsional per periode).
 * Hanya tagihan yang masih ada sisa DAN sudah lewat jatuh tempo.
 */
export async function listTunggakan(
  periode?: string
): Promise<{ santri_id: string; total_sisa: number; jumlah_tagihan: number; rows: TagihanRow[] }[]> {
  const today = todayYmdLocal();
  const rows = (await listTagihan(periode ? { periode } : undefined)).filter((t) =>
    isTagihanTunggakan(t, today)
  );
  const bySantri = new Map<string, TagihanRow[]>();
  for (const t of rows) {
    const list = bySantri.get(t.santri_id) ?? [];
    list.push(t);
    bySantri.set(t.santri_id, list);
  }
  return [...bySantri.entries()]
    .map(([santri_id, list]) => ({
      santri_id,
      total_sisa: list.reduce((acc, t) => acc + sisaTagihan(t), 0),
      jumlah_tagihan: list.length,
      rows: list,
    }))
    .sort((a, b) => b.total_sisa - a.total_sisa);
}

/** Hapus semua data pembayaran milik santri (saat santri dihapus / reset). */
export async function purgePembayaranForSantri(santriId: string): Promise<void> {
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    await runSqlExclusive(async (db) => {
      await db.run(`DELETE FROM pembayaran WHERE santri_id = ?`, [santriId]);
      await db.run(`DELETE FROM tagihan WHERE santri_id = ?`, [santriId]);
    });
    return;
  }
  const st = lsRead();
  const before = st.tagihan.length;
  st.tagihan = st.tagihan.filter((t) => t.santri_id !== santriId);
  if (st.tagihan.length !== before) {
    const ids = new Set(st.tagihan.map((t) => t.id));
    st.pembayaran = st.pembayaran.filter((p) => ids.has(p.tagihan_id));
    lsWrite(st);
    await flushPembayaranToTurso();
  }
}

/** Hapus seluruh data pembayaran (reset total dari halaman Database). */
export async function clearAllPembayaran(): Promise<void> {
  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    await runSqlExclusive(async (db) => {
      await db.run(`DELETE FROM pembayaran`);
      await db.run(`DELETE FROM tagihan`);
      await db.run(`DELETE FROM tagihan_jenis`);
    });
  } else {
    lsWrite({ tagihan_jenis: [], tagihan: [], pembayaran: [] });
  }
  await flushPembayaranToTurso();
}

// ——— Turso sync (incremental, tabel terpisah) ———

/** Satu statement per item — Turso/libSQL tidak selalu menjalankan multi-statement. */
const TURSO_PAYMENT_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS tagihan_jenis (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    nominal_default INTEGER NOT NULL DEFAULT 0,
    periode_jenis TEXT NOT NULL DEFAULT 'bulanan',
    aktif INTEGER NOT NULL DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS tagihan (
    id TEXT PRIMARY KEY,
    santri_id TEXT NOT NULL,
    jenis_id TEXT,
    nama_jenis TEXT NOT NULL DEFAULT '',
    periode TEXT NOT NULL DEFAULT '',
    nominal INTEGER NOT NULL DEFAULT 0,
    terbayar INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'belum',
    jatuh_tempo TEXT,
    catatan TEXT,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE (santri_id, jenis_id, periode)
  )`,
  `CREATE TABLE IF NOT EXISTS pembayaran (
    id TEXT PRIMARY KEY,
    tagihan_id TEXT NOT NULL,
    santri_id TEXT NOT NULL,
    jumlah INTEGER NOT NULL DEFAULT 0,
    tanggal TEXT NOT NULL,
    catatan TEXT,
    created_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tagihan_santri ON tagihan (santri_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tagihan_periode ON tagihan (periode)`,
  `CREATE INDEX IF NOT EXISTS idx_pembayaran_tagihan ON pembayaran (tagihan_id)`,
];

async function ensureTursoPaymentSchema(client: Client): Promise<void> {
  for (const sql of TURSO_PAYMENT_DDL) {
    await client.execute(sql);
  }
}

function tursoClient(): Client | null {
  const url = (import.meta.env.VITE_TURSO_DATABASE_URL as string | undefined)?.trim();
  const token = (import.meta.env.VITE_TURSO_AUTH_TOKEN as string | undefined)?.trim();
  if (!url || !token) return null;
  return createClient({ url, authToken: token });
}

export function isPembayaranSyncConfigured(): boolean {
  return tursoClient() !== null;
}

async function readAllLocal(): Promise<{
  jenis: TagihanJenis[];
  tagihan: TagihanRow[];
  transaksi: PembayaranTransaksi[];
}> {
  const [jenis, tagihan] = await Promise.all([listTagihanJenis(), listTagihan()]);
  let transaksi: PembayaranTransaksi[];
  if (shouldPersistToSqlite()) {
    transaksi = await runSqlExclusive(async (db) => {
      const res = await db.query(`SELECT * FROM pembayaran`);
      return (res.values ?? []).map((r) => mapTransaksi(r as Record<string, unknown>));
    });
  } else {
    transaksi = lsRead().pembayaran;
  }
  return { jenis, tagihan, transaksi };
}

async function execChunks(client: Client, stmts: InStatement[]): Promise<void> {
  const chunk = 40;
  for (let i = 0; i < stmts.length; i += chunk) {
    await client.batch(stmts.slice(i, i + chunk), 'write');
  }
}

/** Push penuh tabel pembayaran ke Turso (upsert + hapus yang tidak ada di lokal). */
export async function pushPembayaranToTurso(): Promise<void> {
  const client = tursoClient();
  if (!client) return;
  await ensureTursoPaymentSchema(client);
  // Baca state lokal apa adanya — jangan pull-live dulu agar mutasi baru tidak tertimpa.
  suppressLivePull = true;
  let local: Awaited<ReturnType<typeof readAllLocal>>;
  try {
    local = await readAllLocal();
  } finally {
    suppressLivePull = false;
  }
  const stmts: InStatement[] = [];
  const now = nowIso();

  for (const j of local.jenis) {
    stmts.push({
      sql: `INSERT INTO tagihan_jenis (id, nama, nominal_default, periode_jenis, aktif, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET nama=excluded.nama, nominal_default=excluded.nominal_default,
              periode_jenis=excluded.periode_jenis, aktif=excluded.aktif, updated_at=excluded.updated_at`,
      args: [j.id, j.nama, j.nominal_default, j.periode_jenis, j.aktif ? 1 : 0, j.created_at ?? now, now],
    });
  }
  for (const t of local.tagihan) {
    stmts.push({
      sql: `INSERT INTO tagihan (id, santri_id, jenis_id, nama_jenis, periode, nominal, terbayar,
              status, jatuh_tempo, catatan, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET santri_id=excluded.santri_id, jenis_id=excluded.jenis_id,
              nama_jenis=excluded.nama_jenis, periode=excluded.periode, nominal=excluded.nominal,
              terbayar=excluded.terbayar, status=excluded.status, jatuh_tempo=excluded.jatuh_tempo,
              catatan=excluded.catatan, updated_at=excluded.updated_at`,
      args: [
        t.id, t.santri_id, t.jenis_id, t.nama_jenis, t.periode, t.nominal, t.terbayar,
        t.status, t.jatuh_tempo ?? null, t.catatan ?? null, t.created_at ?? now, now,
      ],
    });
  }
  for (const p of local.transaksi) {
    stmts.push({
      sql: `INSERT INTO pembayaran (id, tagihan_id, santri_id, jumlah, tanggal, catatan, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET jumlah=excluded.jumlah, tanggal=excluded.tanggal,
              catatan=excluded.catatan`,
      args: [p.id, p.tagihan_id, p.santri_id, p.jumlah, p.tanggal, p.catatan ?? null, p.created_at ?? now],
    });
  }
  await execChunks(client, stmts);

  // Hapus baris remote yang sudah tidak ada di lokal
  const prune = async (table: string, ids: string[]) => {
    if (!ids.length) {
      await client.execute(`DELETE FROM ${table}`);
      return;
    }
    const placeholders = ids.map(() => '?').join(',');
    await client.execute({ sql: `DELETE FROM ${table} WHERE id NOT IN (${placeholders})`, args: ids });
  };
  await prune('pembayaran', local.transaksi.map((p) => p.id));
  await prune('tagihan', local.tagihan.map((t) => t.id));
  await prune('tagihan_jenis', local.jenis.map((j) => j.id));
  console.debug('[pembayaran] pushPembayaranToTurso done:', {
    jenis: local.jenis.length,
    tagihan: local.tagihan.length,
    transaksi: local.transaksi.length,
  });
}

/** Pull tabel pembayaran dari Turso → ganti isi lokal (cloud = sumber kebenaran). */
export async function pullPembayaranFromTurso(): Promise<boolean> {
  const client = tursoClient();
  if (!client) return false;
  await ensureTursoPaymentSchema(client);
  const [jenisRes, tagihanRes, transaksiRes] = await Promise.all([
    client.execute(`SELECT * FROM tagihan_jenis`),
    client.execute(`SELECT * FROM tagihan`),
    client.execute(`SELECT * FROM pembayaran`),
  ]);
  const jenis = jenisRes.rows.map((r) => mapJenis(r as unknown as Record<string, unknown>));
  const tagihan = tagihanRes.rows.map((r) => mapTagihan(r as unknown as Record<string, unknown>));
  const transaksi = transaksiRes.rows.map((r) => mapTransaksi(r as unknown as Record<string, unknown>));

  if (shouldPersistToSqlite()) {
    await initOfflineSqlite();
    await runSqlExclusive(async (db) => {
      await db.run(`DELETE FROM pembayaran`);
      await db.run(`DELETE FROM tagihan`);
      await db.run(`DELETE FROM tagihan_jenis`);
      for (const j of jenis) {
        await db.run(
          `INSERT INTO tagihan_jenis (id, nama, nominal_default, periode_jenis, aktif, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [j.id, j.nama, j.nominal_default, j.periode_jenis, j.aktif ? 1 : 0, j.created_at ?? nowIso(), j.updated_at ?? nowIso()]
        );
      }
      for (const t of tagihan) {
        // santri bisa belum ada di lokal (urutan pull) — tetap insert jika memungkinkan
        await db.run(
          `INSERT OR IGNORE INTO tagihan (id, santri_id, jenis_id, nama_jenis, periode, nominal,
             terbayar, status, jatuh_tempo, catatan, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.id, t.santri_id, t.jenis_id, t.nama_jenis, t.periode, t.nominal, t.terbayar,
           t.status, t.jatuh_tempo ?? null, t.catatan ?? null, t.created_at ?? nowIso(), t.updated_at ?? nowIso()]
        );
      }
      for (const p of transaksi) {
        await db.run(
          `INSERT OR IGNORE INTO pembayaran (id, tagihan_id, santri_id, jumlah, tanggal, catatan, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.tagihan_id, p.santri_id, p.jumlah, p.tanggal, p.catatan ?? null, p.created_at ?? nowIso()]
        );
      }
    });
    return true;
  }

  lsWrite({ tagihan_jenis: jenis, tagihan, pembayaran: transaksi });
  return true;
}

/** Direct Turso: await push ke cloud setelah mutasi. */
async function flushPembayaranToTurso(): Promise<void> {
  if (!isPembayaranSyncConfigured()) {
    throw new Error('Turso wajib untuk menyimpan pembayaran');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Tidak ada internet. Aplikasi wajib online ke Turso.');
  }
  await pushPembayaranToTurso();
  void import('@/lib/sync/ably-realtime')
    .then((m) => m.publishSyncSignal('pembayaran'))
    .catch(() => undefined);
  void import('@/lib/local-reminders')
    .then(({ rescheduleLocalReminders }) => rescheduleLocalReminders())
    .catch(() => undefined);
  void import('@/store/app-store')
    .then(({ useAppStore }) => {
      const st = useAppStore.getState();
      return import('@/lib/in-app-notifications').then(({ syncOperationalInAppNotifications }) =>
        syncOperationalInAppNotifications({
          kegiatan: st.kegiatan as never,
          izin: st.izin as never,
        })
      );
    })
    .catch(() => undefined);
}

/** Direct: selalu pull live dari Turso. */
export async function syncPembayaranOnce(): Promise<void> {
  await ensurePembayaranLiveFromTurso();
}

/** Paksa pull ulang (tombol refresh). */
export async function refreshPembayaranFromCloud(): Promise<boolean> {
  await ensurePembayaranLiveFromTurso();
  return true;
}
