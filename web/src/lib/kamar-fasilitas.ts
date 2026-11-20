export type KamarFasilitasRow = {
  id: string;
  nama: string;
  tanggal: string;
  keterangan?: string;
};

export function formatUsiaFasilitas(tanggal: string | undefined, now = new Date()): string {
  if (!tanggal) return '-';
  const start = new Date(tanggal);
  if (Number.isNaN(start.getTime())) return '-';

  const diffMs = Math.max(0, now.getTime() - start.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days < 30) return days <= 1 ? 'Baru dipasang' : `${days} hari`;
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  if (months < 12) {
    return remDays > 0 ? `${months} bln ${remDays} hr` : `${months} bulan`;
  }
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths > 0) return `${years} thn ${remMonths} bln`;
  return `${years} tahun`;
}

export function formatTanggalFasilitas(tanggal: string): string {
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
