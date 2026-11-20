import type { LaporanCustomRange, LaporanPeriod } from './laporan-reports';
import { laporanPeriodToDateKeys } from './absensi-api';

async function fetchJsonArray(url: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal memuat data laporan');
  return (await res.json()) as Record<string, unknown>[];
}

export async function fetchIzinForLaporanPeriod(
  period: LaporanPeriod,
  customRange?: LaporanCustomRange
) {
  const { dari, sampai } = laporanPeriodToDateKeys(period, customRange);
  const sp = new URLSearchParams({ dari, sampai });
  return fetchJsonArray(`/api/izin?${sp.toString()}`);
}

export async function fetchPembinaanForLaporanPeriod(
  period: LaporanPeriod,
  customRange?: LaporanCustomRange
) {
  const { dari, sampai } = laporanPeriodToDateKeys(period, customRange);
  const sp = new URLSearchParams({ dari, sampai });
  return fetchJsonArray(`/api/pembinaan?${sp.toString()}`);
}
