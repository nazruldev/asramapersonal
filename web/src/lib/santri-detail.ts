import type { SantriAsalWilayahFields } from '@/lib/wilayah-types';

export type SantriProfile = {
  id: string;
  nama: string;
  kelas?: string;
  kamar?: string;
  nomor_wali?: string;
  jenis_kelamin?: string;
  created_by?: string;
  updated_by?: string;
  include_wa?: boolean;
  catatan?: string;
  catatan_medis?: string;
  foto?: string;
  jumlah_pelanggaran?: number;
  is_ketua_kamar?: number | boolean;
  created_at?: string;
  updated_at?: string;
  masuk_kamar_sejak?: string;
} & SantriAsalWilayahFields;

export function santriDetailPath(santriId: string): string {
  return `/master/santri/${encodeURIComponent(santriId)}`;
}

export function parseSantriIdFromDetailPath(pathname: string): string | null {
  const match = pathname.match(/^\/master\/santri\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function formatSantriDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatSantriDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
