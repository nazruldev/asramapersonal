export const PEMBINAAN_PAGE_SIZE = 8;

import { normalizeAppPathname } from '@/lib/app-navigation';

export type PembinaanCategory = 'Semua' | 'Pelanggaran' | 'Teguran';

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
  countTeguran: number;
};

export function pembinaanDetailPath(santriId: string): string {
  return `/laporan/pembinaan/${encodeURIComponent(santriId)}`;
}

export function parsePembinaanCategoryParam(value: string | null): PembinaanCategory {
  if (value === 'Pelanggaran' || value === 'Teguran' || value === 'Semua') {
    return value;
  }
  return 'Semua';
}

export function filterPembinaanByCategory(
  rows: PembinaanRow[],
  category: PembinaanCategory
): PembinaanRow[] {
  if (category === 'Semua') return rows;
  return rows.filter((item) => item.jenis === category);
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
    if (item.jenis === 'Pelanggaran') group.countPelanggaran += 1;
    else if (item.jenis === 'Teguran') group.countTeguran += 1;
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

export function getPembinaanBadgeStyle(jenis: string): string {
  switch (jenis) {
    case 'Teguran':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
    case 'Pelanggaran':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600';
  }
}

export function parsePembinaanSantriIdFromPath(pathname: string): string | null {
  const path = normalizeAppPathname(pathname);
  const match = path.match(/^\/laporan\/pembinaan\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
