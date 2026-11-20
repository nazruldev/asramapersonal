import type { AppSettings } from '@/lib/app-settings';
import { getPelanggaranTier } from '@/lib/app-settings';
import type { PembinaanRow } from '@/lib/pembinaan-group';
import type { EntityRow } from '@/store/app-store';

export type PeringkatKind = 'izin' | 'pelanggaran' | 'teguran';

export type PeringkatEntry = {
  santriId: string;
  nama: string;
  kelas: string;
  kamar: string;
  count: number;
  /** Label tambahan (mis. tingkat pelanggaran) */
  sublabel?: string;
};

type SantriRow = {
  id: string;
  nama?: string;
  kelas?: string;
  kamar?: string;
  jumlah_pelanggaran?: number;
};

type IzinRow = EntityRow;

function findSantri(santriList: SantriRow[], santriId: string): SantriRow | undefined {
  return santriList.find((x) => x.id === santriId);
}

function santriMeta(
  santriList: SantriRow[],
  santriId: string
): { nama: string; kelas: string; kamar: string } {
  const s = findSantri(santriList, santriId);
  return {
    nama: String(s?.nama ?? 'Santri'),
    kelas: String(s?.kelas ?? '-'),
    kamar: String(s?.kamar ?? '-'),
  };
}

function toRanked(entries: PeringkatEntry[]): PeringkatEntry[] {
  return [...entries].sort((a, b) => b.count - a.count || a.nama.localeCompare(b.nama, 'id'));
}

/** Total surat izin per santri (semua riwayat). */
export function buildPeringkatIzin(izinList: IzinRow[], santriList: SantriRow[]): PeringkatEntry[] {
  const counts = new Map<string, number>();
  for (const i of izinList) {
    const id = String(i.santri_id ?? '').trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const rows: PeringkatEntry[] = [];
  for (const [santriId, count] of counts) {
    if (count <= 0) continue;
    if (!findSantri(santriList, santriId)) continue;
    const meta = santriMeta(santriList, santriId);
    rows.push({ santriId, ...meta, count });
  }
  return toRanked(rows);
}

/** Hitungan akumulasi pelanggaran resmi di profil santri. */
export function buildPeringkatPelanggaran(
  santriList: SantriRow[],
  settings: AppSettings
): PeringkatEntry[] {
  const rows: PeringkatEntry[] = [];
  for (const s of santriList) {
    const count = Number(s.jumlah_pelanggaran ?? 0);
    if (count <= 0) continue;
    const tier = getPelanggaranTier(count, settings);
    rows.push({
      santriId: s.id,
      nama: String(s.nama ?? 'Santri'),
      kelas: String(s.kelas ?? '-'),
      kamar: String(s.kamar ?? '-'),
      count,
      sublabel: tier?.label,
    });
  }
  return toRanked(rows);
}

/** Jumlah catatan BK jenis Teguran per santri. */
export function buildPeringkatTeguran(
  pembinaanList: PembinaanRow[],
  santriList: SantriRow[]
): PeringkatEntry[] {
  const counts = new Map<string, number>();
  for (const p of pembinaanList) {
    if (p.jenis !== 'Teguran') continue;
    counts.set(p.santri_id, (counts.get(p.santri_id) ?? 0) + 1);
  }
  const rows: PeringkatEntry[] = [];
  for (const [santriId, count] of counts) {
    if (count <= 0) continue;
    if (!findSantri(santriList, santriId)) continue;
    rows.push({ santriId, ...santriMeta(santriList, santriId), count });
  }
  return toRanked(rows);
}

export function buildPeringkatForKind(
  kind: PeringkatKind,
  ctx: {
    santri: SantriRow[];
    izin: IzinRow[];
    pembinaan: PembinaanRow[];
    settings: AppSettings;
  }
): PeringkatEntry[] {
  switch (kind) {
    case 'izin':
      return buildPeringkatIzin(ctx.izin, ctx.santri);
    case 'pelanggaran':
      return buildPeringkatPelanggaran(ctx.santri, ctx.settings);
    case 'teguran':
      return buildPeringkatTeguran(ctx.pembinaan, ctx.santri);
  }
}

export const PERINGKAT_TABS: { id: PeringkatKind; label: string; hint: string; countLabel: string }[] = [
  {
    id: 'izin',
    label: 'Izin',
    hint: 'Santri dengan riwayat izin keluar terbanyak',
    countLabel: 'izin',
  },
  {
    id: 'pelanggaran',
    label: 'Pelanggaran',
    hint: 'Hitungan pelanggaran akumulasi tertinggi',
    countLabel: 'x',
  },
  {
    id: 'teguran',
    label: 'Teguran',
    hint: 'Catatan teguran BK terbanyak',
    countLabel: 'teguran',
  },
];
