import { eachMonthOfInterval, format, parse } from 'date-fns';
import type { LaporanCustomRange, LaporanPeriod } from './laporan-reports';
import { laporanRekapInterval } from './laporan-reports';

async function fetchJsonArray(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal memuat data laporan');
  return (await res.json()) as Record<string, unknown>[];
}

// Laporan selalu memuat seluruh riwayat — tidak ada filter tanggal.
export async function fetchIzinForLaporanPeriod(
  _period?: LaporanPeriod,
  _customRange?: LaporanCustomRange
) {
  return fetchJsonArray('/api/izin');
}

export async function fetchPembinaanForLaporanPeriod(
  _period?: LaporanPeriod,
  _customRange?: LaporanCustomRange
) {
  return fetchJsonArray('/api/pembinaan');
}

/** Bulan tagihan (YYYY-MM) yang overlap dengan interval rekap laporan. */
export function laporanMonthsFromPeriod(
  period: LaporanPeriod,
  customRange?: LaporanCustomRange,
  now = new Date()
): string[] {
  const { start, end } = laporanRekapInterval(period, customRange, now);
  const months = eachMonthOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM'));
  return [...new Set(months)];
}

/** Label singkat daftar bulan tagihan untuk header laporan. */
export function laporanMonthsLabel(months: string[]): string {
  if (months.length === 0) return '—';
  if (months.length === 1) {
    const d = parse(`${months[0]}-01`, 'yyyy-MM-dd', new Date());
    return format(d, 'MMMM yyyy');
  }
  const first = parse(`${months[0]}-01`, 'yyyy-MM-dd', new Date());
  const last = parse(`${months[months.length - 1]}-01`, 'yyyy-MM-dd', new Date());
  return `${format(first, 'MMM yyyy')} – ${format(last, 'MMM yyyy')}`;
}

/**
 * Tagihan untuk bulan-bulan yang overlap periode laporan.
 * Dedup by id jika rentang lintas bulan dan API mengembalikan baris sama.
 */
export async function fetchPembayaranForLaporanPeriod(
  period: LaporanPeriod,
  customRange?: LaporanCustomRange
): Promise<Record<string, unknown>[]> {
  // 'all' → ambil semua tagihan tanpa filter periode.
  if (period === 'all') {
    return fetchJsonArray('/api/pembayaran/tagihan');
  }

  const months = laporanMonthsFromPeriod(period, customRange);
  if (months.length === 0) return [];

  const batches = await Promise.all(
    months.map((periode) => {
      const sp = new URLSearchParams({ periode });
      return fetchJsonArray(`/api/pembayaran/tagihan?${sp.toString()}`);
    })
  );

  const byId = new Map<string, Record<string, unknown>>();
  for (const rows of batches) {
    for (const row of rows) {
      const id = String(row.id ?? '');
      if (id) byId.set(id, row);
      else byId.set(`${row.santri_id}-${row.jenis_id}-${row.periode}`, row);
    }
  }
  return [...byId.values()];
}
