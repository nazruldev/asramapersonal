import { normalizeAppPathname } from '@/lib/app-navigation';

/** Nilai batas_kembali jika tanggal pulang belum diketahui (mis. sakit). */
export const IZIN_BATAS_BELUM_PASTI = '9999-12-31T23:59:59.999Z';

export type IzinDurasiPreset = '1hari' | '2hari' | '1minggu' | '1bulan' | 'custom' | 'belum_pasti';

export type IzinRow = {
  id: string;
  santri_id: string;
  santri_nama?: string;
  santri_kamar?: string;
  santri_wali?: string;
  alasan: string;
  tanggal_keluar: string;
  batas_kembali: string;
  penjemput?: string;
  status_kembali: string;
  waktu_kembali_aktual?: string;
};

export function isIzinBatasBelumPasti(batas: string | undefined | null): boolean {
  if (!batas) return false;
  return batas === IZIN_BATAS_BELUM_PASTI || batas.startsWith('9999-12-31');
}

export function toDatetimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function parseDatetimeLocal(value: string): Date {
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min] = (timePart || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

export function datetimeLocalToIso(local: string): string {
  return parseDatetimeLocal(local).toISOString();
}

export function batasKembaliLocalFromKeluar(
  keluarLocal: string,
  preset: Exclude<IzinDurasiPreset, 'custom' | 'belum_pasti'>
): string {
  const end = parseDatetimeLocal(keluarLocal);
  switch (preset) {
    case '1hari':
      end.setDate(end.getDate() + 1);
      break;
    case '2hari':
      end.setDate(end.getDate() + 2);
      break;
    case '1minggu':
      end.setDate(end.getDate() + 7);
      break;
    case '1bulan':
      end.setMonth(end.getMonth() + 1);
      break;
    default:
      break;
  }
  return toDatetimeLocalValue(end);
}

export function formatIzinBatasKembali(value: string, withTime = true): string {
  if (isIzinBatasBelumPasti(value)) return 'Belum pasti (menunggu kondisi)';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export type IzinStatusFilter = 'Semua' | 'Belum' | 'Sudah';

export type SantriIzinGroup = {
  santriId: string;
  santriNama: string;
  santriKamar: string;
  records: IzinRow[];
  latestTanggalKeluar: string;
  activeIzin: IzinRow | null;
};

export function izinDetailPath(santriId: string): string {
  return `/laporan/izin/${encodeURIComponent(santriId)}`;
}

export function parseIzinSantriIdFromPath(pathname: string): string | null {
  const path = normalizeAppPathname(pathname);
  const match = path.match(/^\/laporan\/izin\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function isIzinTerlambat(item: IzinRow, now = new Date()): boolean {
  if (item.status_kembali !== 'Belum') return false;
  if (isIzinBatasBelumPasti(item.batas_kembali)) return false;
  return now.getTime() > new Date(item.batas_kembali).getTime();
}

function dateKeyFromIso(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Santri dianggap masih izin pada tanggal absensi (yyyy-MM-dd):
 * - Belum kembali: dari tanggal keluar sampai sekarang.
 * - Sudah kembali: hanya hari antara keluar (inklusif) dan sebelum hari kembali aktual
 *   (hari pulang dan setelahnya tidak dikunci izin — bisa Hadir).
 */
export function isSantriOnIzinForDate(
  izinList: IzinRow[],
  santriId: string,
  dateKey: string
): boolean {
  return izinList.some((i) => {
    if (i.santri_id !== santriId) return false;
    const keluarKey = dateKeyFromIso(i.tanggal_keluar);
    if (dateKey < keluarKey) return false;

    if (i.status_kembali === 'Belum') {
      return true;
    }

    const kembaliKey = i.waktu_kembali_aktual
      ? dateKeyFromIso(i.waktu_kembali_aktual)
      : dateKeyFromIso(i.batas_kembali);
    return dateKey < kembaliKey;
  });
}

export function collectSantriIdsSedangIzin(rows: IzinRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.status_kembali === 'Belum') ids.add(row.santri_id);
  }
  return ids;
}

export function groupIzinBySantri(rows: IzinRow[]): SantriIzinGroup[] {
  const map = new Map<string, SantriIzinGroup>();

  for (const item of rows) {
    const sid = item.santri_id;
    let group = map.get(sid);
    if (!group) {
      group = {
        santriId: sid,
        santriNama: item.santri_nama?.trim() || 'Santri',
        santriKamar: item.santri_kamar || '-',
        records: [],
        latestTanggalKeluar: item.tanggal_keluar,
        activeIzin: null,
      };
      map.set(sid, group);
    }
    group.records.push(item);
    if (new Date(item.tanggal_keluar).getTime() > new Date(group.latestTanggalKeluar).getTime()) {
      group.latestTanggalKeluar = item.tanggal_keluar;
    }
  }

  return Array.from(map.values())
    .map((g) => {
      const records = [...g.records].sort(
        (a, b) => new Date(b.tanggal_keluar).getTime() - new Date(a.tanggal_keluar).getTime()
      );
      const activeIzin = records.find((r) => r.status_kembali === 'Belum') ?? null;
      return { ...g, records, activeIzin };
    })
    .sort(
      (a, b) => new Date(b.latestTanggalKeluar).getTime() - new Date(a.latestTanggalKeluar).getTime()
    );
}

export function filterIzinGroupsByStatus(
  groups: SantriIzinGroup[],
  status: IzinStatusFilter
): SantriIzinGroup[] {
  if (status === 'Belum') return groups.filter((g) => g.activeIzin !== null);
  if (status === 'Sudah') return groups.filter((g) => g.activeIzin === null);
  return groups;
}
