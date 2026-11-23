import { format } from 'date-fns';
import type { LaporanCustomRange, LaporanPeriod } from './laporan-reports';
import { laporanRekapToDateKeys } from './laporan-reports';

export type AbsensiApiRow = {
  id: string;
  santri_id: string;
  kegiatan: string;
  tanggal: string;
  status: string;
  santri_nama?: string;
  santri_kamar?: string;
};

function mapAbsensiRow(raw: Record<string, unknown>): AbsensiApiRow {
  return {
    id: String(raw.id),
    santri_id: String(raw.santri_id),
    kegiatan: String(raw.kegiatan ?? raw.kegiatan_label ?? ''),
    tanggal: String(raw.tanggal),
    status: String(raw.status),
    santri_nama: raw.santri_nama != null ? String(raw.santri_nama) : undefined,
    santri_kamar: raw.santri_kamar != null ? String(raw.santri_kamar) : undefined,
  };
}

export async function fetchAbsensiForDay(params: {
  tanggal: string;
  kegiatan?: string;
}): Promise<AbsensiApiRow[]> {
  const sp = new URLSearchParams();
  sp.set('tanggal', params.tanggal.slice(0, 10));
  if (params.kegiatan?.trim()) sp.set('kegiatan', params.kegiatan.trim());
  const res = await fetch(`/api/absensi?${sp.toString()}`);
  if (!res.ok) throw new Error('Gagal memuat absensi');
  const data = (await res.json()) as Record<string, unknown>[];
  return data.map(mapAbsensiRow);
}

export async function fetchAbsensiForRange(dari: string, sampai: string): Promise<AbsensiApiRow[]> {
  const sp = new URLSearchParams();
  sp.set('dari', dari.slice(0, 10));
  sp.set('sampai', sampai.slice(0, 10));
  const res = await fetch(`/api/absensi?${sp.toString()}`);
  if (!res.ok) throw new Error('Gagal memuat absensi');
  const data = (await res.json()) as Record<string, unknown>[];
  return data.map(mapAbsensiRow);
}

export function laporanPeriodToDateKeys(
  period: LaporanPeriod,
  customRange?: LaporanCustomRange,
  now = new Date()
): {
  dari: string;
  sampai: string;
} {
  return laporanRekapToDateKeys(period, customRange, now);
}

// Laporan selalu memuat seluruh riwayat — tidak ada filter tanggal.
export async function fetchAbsensiForLaporanPeriod(
  _period?: LaporanPeriod,
  _customRange?: LaporanCustomRange
): Promise<AbsensiApiRow[]> {
  const res = await fetch('/api/absensi');
  if (!res.ok) throw new Error('Gagal memuat absensi');
  const data = (await res.json()) as Record<string, unknown>[];
  return data.map(mapAbsensiRow);
}
