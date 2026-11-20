import type { AppSettings } from '../app-settings';
import type { PenjadwalanPreset } from '../penjadwalan';
import type { SantriKamarRiwayatRow } from '../santri-kamar-riwayat';

export type OfflineDbSnapshot = {
  santri: Record<string, unknown>[];
  kamar: Record<string, unknown>[];
  kelas: Record<string, unknown>[];
  kegiatan: Record<string, unknown>[];
  penjadwalan: Record<string, unknown>[];
  penjadwalanPreset: PenjadwalanPreset[];
  absensi: Record<string, unknown>[];
  izin: Record<string, unknown>[];
  pembinaan: Record<string, unknown>[];
  riwayat_kamar: SantriKamarRiwayatRow[];
  settings: AppSettings;
};
