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

/** Parse tanggal aman: yyyy-MM-dd / midnight UTC → hari lokal (tidak geser -1). */
function parseSantriDisplayDate(value: string): Date | null {
  const raw = value.trim();
  if (!raw) return null;
  const datePart = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const rest = raw.slice(10).trim();
    const isCalendarDay =
      !rest ||
      rest === 'T00:00:00.000Z' ||
      rest === 'T00:00:00Z' ||
      /^T00:00:00(\.0+)?(Z|[+-]00:00)?$/i.test(rest);
    if (isCalendarDay) {
      const [y, m, d] = datePart.split('-').map(Number);
      const local = new Date(y, m - 1, d);
      return Number.isNaN(local.getTime()) ? null : local;
    }
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatSantriDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = parseSantriDisplayDate(value);
  if (!d) return '—';
  const rest = value.trim().slice(10).trim();
  const dateOnly =
    /^\d{4}-\d{2}-\d{2}$/.test(value.trim().slice(0, 10)) &&
    (!rest ||
      rest === 'T00:00:00.000Z' ||
      rest === 'T00:00:00Z' ||
      /^T00:00:00(\.0+)?(Z|[+-]00:00)?$/i.test(rest));
  if (dateOnly) {
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
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
  const d = parseSantriDisplayDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
