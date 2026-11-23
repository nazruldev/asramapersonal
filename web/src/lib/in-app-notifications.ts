/**
 * Kotak masuk notifikasi in-app (lokal, tanpa backend).
 * Diisi dari kondisi operasional (absensi/izin/tunggakan) + notifikasi lokal OS.
 */
import {
  isKegiatanActiveOnDate,
  parseJamMenit,
  type KegiatanSchedule,
} from '@/lib/kegiatan-schedule';
import { isIzinBatasBelumPasti, type IzinRow } from '@/lib/izin-group';
import {
  effectiveJatuhTempo,
  isTagihanTunggakan,
  listTagihan,
  sisaTagihan,
  type TagihanRow,
} from '@/lib/pembayaran-store';

export type InAppNotificationType = 'absensi' | 'izin' | 'tunggakan' | 'sistem';

export type InAppNotification = {
  id: string;
  type: InAppNotificationType;
  title: string;
  body: string;
  route?: string;
  createdAt: string;
  readAt?: string;
  /** true = dari kondisi data aktif (bisa hilang jika sudah selesai) */
  operational?: boolean;
};

const STORAGE_KEY = 'asrama_in_app_notifications_v1';
const MAX_ITEMS = 80;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeInAppNotifications(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function todayDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadAll(): InAppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as InAppNotification[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => n && typeof n.id === 'string' && typeof n.title === 'string');
  } catch {
    return [];
  }
}

function saveAll(items: InAppNotification[]): void {
  const trimmed = items
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ITEMS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  emit();
}

export function listInAppNotifications(): InAppNotification[] {
  return loadAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function countUnreadInAppNotifications(): number {
  return loadAll().filter((n) => !n.readAt).length;
}

export function upsertInAppNotification(
  input: Omit<InAppNotification, 'createdAt' | 'readAt'> & {
    createdAt?: string;
    /** jika true dan sudah ada + sudah dibaca, tetap dianggap dibaca */
    keepRead?: boolean;
  }
): void {
  const all = loadAll();
  const idx = all.findIndex((n) => n.id === input.id);
  const now = input.createdAt ?? new Date().toISOString();
  if (idx >= 0) {
    const prev = all[idx]!;
    all[idx] = {
      ...prev,
      ...input,
      createdAt: prev.createdAt || now,
      readAt: input.keepRead === false ? undefined : prev.readAt,
    };
  } else {
    all.unshift({
      id: input.id,
      type: input.type,
      title: input.title,
      body: input.body,
      route: input.route,
      operational: input.operational,
      createdAt: now,
    });
  }
  saveAll(all);
}

export function markInAppNotificationRead(id: string): void {
  const all = loadAll();
  const idx = all.findIndex((n) => n.id === id);
  if (idx < 0 || all[idx]!.readAt) return;
  all[idx] = { ...all[idx]!, readAt: new Date().toISOString() };
  saveAll(all);
}

export function markAllInAppNotificationsRead(): void {
  const now = new Date().toISOString();
  const all = loadAll().map((n) => (n.readAt ? n : { ...n, readAt: now }));
  saveAll(all);
}

export function removeInAppNotification(id: string): void {
  saveAll(loadAll().filter((n) => n.id !== id));
}

export function clearReadInAppNotifications(): void {
  saveAll(loadAll().filter((n) => !n.readAt));
}

/** Sinkronkan alert operasional dari data terkini. */
export async function syncOperationalInAppNotifications(input: {
  kegiatan: KegiatanSchedule[];
  izin: IzinRow[];
}): Promise<void> {
  const now = new Date();
  const today = todayDateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const next: InAppNotification[] = [];

  // Absensi hari ini yang sudah/lewat jam mulai (atau tanpa jam)
  for (const keg of input.kegiatan) {
    if (keg.untuk_absensi === false) continue;
    if (!isKegiatanActiveOnDate(keg, today)) continue;
    const start = parseJamMenit(keg.jam_mulai);
    if (start !== null && nowMin + 30 < start) continue; // masih jauh
    next.push({
      id: `op-absensi:${keg.id}:${today}`,
      type: 'absensi',
      title: `Absensi: ${keg.nama}`,
      body:
        start !== null
          ? `Jadwal absensi hari ini pukul ${keg.jam_mulai}.`
          : 'Jadwal absensi hari ini.',
      route: '/laporan/absensi',
      createdAt: `${today}T00:00:00.000Z`,
      operational: true,
    });
  }

  // Izin lewat batas / hampir habis (< 2 jam)
  for (const row of input.izin) {
    if (String(row.status_kembali) !== 'Belum') continue;
    if (isIzinBatasBelumPasti(row.batas_kembali)) continue;
    const batas = new Date(row.batas_kembali);
    if (Number.isNaN(batas.getTime())) continue;
    const nama = row.santri_nama?.trim() || 'Santri';
    const msLeft = batas.getTime() - now.getTime();
    if (msLeft > 2 * 60 * 60 * 1000) continue;
    const overdue = msLeft <= 0;
    next.push({
      id: `op-izin:${row.id}`,
      type: 'izin',
      title: overdue ? 'Izin lewat batas' : 'Izin hampir habis',
      body: overdue
        ? `${nama} belum kembali ke asrama.`
        : `${nama} harus kembali kurang dari 2 jam.`,
      route: '/laporan/izin',
      createdAt: now.toISOString(),
      operational: true,
    });
  }

  // Tunggakan + jatuh tempo hari ini
  let tagihan: TagihanRow[] = [];
  try {
    tagihan = await listTagihan();
  } catch {
    tagihan = [];
  }
  const unpaid = tagihan.filter((t) => sisaTagihan(t) > 0);
  const overdue = unpaid.filter((t) => isTagihanTunggakan(t, today));
  if (overdue.length > 0) {
    const total = overdue.reduce((a, t) => a + sisaTagihan(t), 0);
    const santriN = new Set(overdue.map((t) => t.santri_id)).size;
    next.push({
      id: `op-tunggakan:summary:${today}`,
      type: 'tunggakan',
      title: 'Ada tunggakan',
      body: `${santriN} santri · ${overdue.length} tagihan · sisa Rp ${total.toLocaleString('id-ID')}.`,
      route: '/master/pembayaran',
      createdAt: `${today}T01:00:00.000Z`,
      operational: true,
    });
  }
  for (const t of unpaid) {
    const due = effectiveJatuhTempo(t);
    if (due !== today) continue;
    if (isTagihanTunggakan(t, today)) continue;
    next.push({
      id: `op-tunggakan:due:${t.id}:${today}`,
      type: 'tunggakan',
      title: 'Tagihan jatuh tempo hari ini',
      body: `${t.nama_jenis || 'Tagihan'} — sisa Rp ${sisaTagihan(t).toLocaleString('id-ID')}.`,
      route: '/master/pembayaran',
      createdAt: `${today}T01:00:00.000Z`,
      operational: true,
    });
  }

  const existing = loadAll();
  const nextIds = new Set(next.map((n) => n.id));
  const kept = existing.filter((n) => {
    if (!n.operational) return true;
    return nextIds.has(n.id);
  });

  const byId = new Map(kept.map((n) => [n.id, n]));
  for (const n of next) {
    const prev = byId.get(n.id);
    byId.set(n.id, {
      ...n,
      createdAt: prev?.createdAt ?? n.createdAt,
      readAt: prev?.readAt,
    });
  }

  saveAll([...byId.values()]);
}

/** Catat notifikasi dari OS (local notification received / tapped). */
export function pushFromLocalOsNotification(input: {
  title?: string;
  body?: string;
  type?: InAppNotificationType;
  route?: string;
  idHint?: string;
}): void {
  const title = (input.title || 'Pengingat').trim();
  const body = (input.body || '').trim();
  const id =
    input.idHint?.trim() ||
    `os:${input.type ?? 'sistem'}:${title}:${body}`.slice(0, 120);
  upsertInAppNotification({
    id,
    type: input.type ?? 'sistem',
    title,
    body: body || title,
    route: input.route,
    operational: false,
    keepRead: false,
  });
}
