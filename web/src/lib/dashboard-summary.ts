import { formatWaktuKegiatan, type KegiatanSchedule } from '@/lib/kegiatan-schedule';
import { isIzinBatasBelumPasti } from '@/lib/izin-group';

type IzinRow = {
  santri_id: string;
  status_kembali: string;
  tanggal_keluar: string;
  batas_kembali: string;
  waktu_kembali_aktual?: string;
};

type AbsensiRow = {
  santri_id: string;
  kegiatan: string;
  tanggal: string;
};

type SantriRow = {
  id: string;
  kamar?: string;
};

function dateKeyFromIso(iso: string) {
  return iso.slice(0, 10);
}

function isSantriOnIzinForDate(izinList: IzinRow[], santriId: string, dateKey: string): boolean {
  return izinList.some((i) => {
    if (i.santri_id !== santriId) return false;
    const keluarKey = dateKeyFromIso(i.tanggal_keluar);
    if (dateKey < keluarKey) return false;
    if (i.status_kembali === 'Belum') return true;
    const kembaliKey = i.waktu_kembali_aktual
      ? dateKeyFromIso(i.waktu_kembali_aktual)
      : dateKeyFromIso(i.batas_kembali);
    return dateKey <= kembaliKey;
  });
}

export function countSantriTanpaKamar(santriList: SantriRow[]): number {
  return santriList.filter((s) => !String(s.kamar ?? '').trim()).length;
}

export function countIzinTerlambat(izinList: ReadonlyArray<Record<string, unknown>>): number {
  const now = new Date();
  return izinList.filter((i) => {
    if (String(i.status_kembali ?? '') !== 'Belum') return false;
    const batas = String(i.batas_kembali ?? '');
    if (isIzinBatasBelumPasti(batas)) return false;
    return new Date(batas) < now;
  }).length;
}

export type DashboardAbsensiKegiatan = {
  id: string;
  nama: string;
  waktuLabel: string;
  tercatat: number;
  target: number;
  selesai: boolean;
};

export function buildDashboardAbsensiKegiatan(
  todayKey: string,
  schedule: KegiatanSchedule[],
  absensiList: AbsensiRow[],
  santriList: SantriRow[],
  izinList: IzinRow[]
): DashboardAbsensiKegiatan[] {
  const absensiHari = absensiList.filter((a) => String(a.tanggal).startsWith(todayKey));
  const targetSantri = santriList.filter(
    (s) => !isSantriOnIzinForDate(izinList, s.id, todayKey)
  );

  return schedule.map((keg) => {
    const rows = absensiHari.filter((a) => a.kegiatan === keg.nama);
    const uniqueSantri = new Set(rows.map((a) => a.santri_id));
    const tercatat = uniqueSantri.size;
    const target = targetSantri.length;
    const waktu =
      formatWaktuKegiatan(keg.jam_mulai, keg.jam_selesai) || keg.waktu || '—';
    return {
      id: keg.id,
      nama: keg.nama,
      waktuLabel: waktu,
      tercatat,
      target,
      selesai: target > 0 && tercatat >= target,
    };
  });
}

export function totalAbsensiTercatatHariIni(rows: DashboardAbsensiKegiatan[]): {
  kegiatan: number;
  selesai: number;
  totalCatatan: number;
} {
  return {
    kegiatan: rows.length,
    selesai: rows.filter((r) => r.selesai).length,
    totalCatatan: rows.reduce((n, r) => n + r.tercatat, 0),
  };
}
