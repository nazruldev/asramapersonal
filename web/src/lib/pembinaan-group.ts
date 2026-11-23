export const PEMBINAAN_PAGE_SIZE = 8;

import { normalizeAppPathname } from '@/lib/app-navigation';

/** Satu-satunya jenis catatan yang dipakai aplikasi (teguran dihapus). */
export const PEMBINAAN_JENIS_PELANGGARAN = 'Pelanggaran' as const;

export type PembinaanCategory = 'Semua' | 'Pelanggaran';

export type PembinaanRow = {
  id: string;
  santri_id: string;
  santri_nama?: string;
  santri_kamar?: string;
  jenis: string;
  keterangan: string;
  tanggal: string;
  tindak_lanjut?: string;
};

export type SantriPembinaanGroup = {
  santriId: string;
  santriNama: string;
  santriKamar: string;
  records: PembinaanRow[];
  latestTanggal: string;
  countPelanggaran: number;
  /** @deprecated teguran dihapus — selalu 0 */
  countTeguran: number;
};

export function pembinaanDetailPath(santriId: string): string {
  return `/laporan/pembinaan/${encodeURIComponent(santriId)}`;
}

export function parsePembinaanCategoryParam(value: string | null): PembinaanCategory {
  if (value === 'Pelanggaran' || value === 'Semua') return value;
  // Legacy query ?jenis=Teguran → tampilkan semua pelanggaran
  return 'Semua';
}

export function filterPembinaanByCategory(
  rows: PembinaanRow[],
  category: PembinaanCategory
): PembinaanRow[] {
  if (category === 'Semua') return rows;
  return rows.filter((item) => item.jenis === PEMBINAAN_JENIS_PELANGGARAN || item.jenis === 'Teguran');
}

export function groupPembinaanBySantri(rows: PembinaanRow[]): SantriPembinaanGroup[] {
  const map = new Map<string, SantriPembinaanGroup>();

  for (const item of rows) {
    const sid = item.santri_id;
    let group = map.get(sid);
    if (!group) {
      group = {
        santriId: sid,
        santriNama: item.santri_nama?.trim() || 'Santri',
        santriKamar: item.santri_kamar || '-',
        records: [],
        latestTanggal: item.tanggal,
        countPelanggaran: 0,
        countTeguran: 0,
      };
      map.set(sid, group);
    }
    group.records.push(item);
    if (new Date(item.tanggal).getTime() > new Date(group.latestTanggal).getTime()) {
      group.latestTanggal = item.tanggal;
    }
    // Semua catatan dihitung sebagai pelanggaran (legacy teguran ikut dihitung).
    group.countPelanggaran += 1;
  }

  return Array.from(map.values())
    .map((g) => ({
      ...g,
      records: [...g.records].sort(
        (a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()
      ),
    }))
    .sort((a, b) => new Date(b.latestTanggal).getTime() - new Date(a.latestTanggal).getTime());
}

export function getPembinaanBadgeStyle(_jenis?: string): string {
  return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
}

/** Label tampilan jenis — teguran legacy ditampilkan sebagai Pelanggaran. */
export function pembinaanJenisLabel(_jenis?: string): string {
  return 'Pelanggaran';
}

export function parsePembinaanSantriIdFromPath(pathname: string): string | null {
  const path = normalizeAppPathname(pathname);
  const match = path.match(/^\/laporan\/pembinaan\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
