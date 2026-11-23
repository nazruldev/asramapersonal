import { normalizeAppPathname } from '@/lib/app-navigation';

/** Halaman tagihan per santri (semua status, bukan hanya tunggakan). */
export function santriTagihanPath(santriId: string): string {
  return `/master/santri/${encodeURIComponent(santriId)}/tagihan`;
}

/** @deprecated gunakan santriTagihanPath */
export function santriTunggakanPath(santriId: string): string {
  return santriTagihanPath(santriId);
}

export function parseSantriIdFromTagihanPath(pathname: string): string | null {
  const path = normalizeAppPathname(pathname);
  const match = path.match(/^\/master\/santri\/([^/]+)\/tagihan$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Alias lama path /tunggakan → tetap dikenali. */
export function parseSantriIdFromTunggakanPath(pathname: string): string | null {
  const path = normalizeAppPathname(pathname);
  const matchTagihan = path.match(/^\/master\/santri\/([^/]+)\/tagihan$/);
  if (matchTagihan) return decodeURIComponent(matchTagihan[1]);
  const matchLegacy = path.match(/^\/master\/santri\/([^/]+)\/tunggakan$/);
  return matchLegacy ? decodeURIComponent(matchLegacy[1]) : null;
}

const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function labelPeriodeTagihan(periode: string): string {
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (!m) return periode || '-';
  return `${NAMA_BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}
