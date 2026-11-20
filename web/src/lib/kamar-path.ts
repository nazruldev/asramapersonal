export function kamarDetailPath(kamarId: string): string {
  return `/master/kamar/${encodeURIComponent(kamarId)}`;
}

export function parseKamarIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/master\/kamar\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Lama tinggal di kamar saat ini (reset saat pindah kamar) */
export function formatLamaDiKamar(masukSejak?: string | null, now = new Date()): string {
  if (!masukSejak) return 'Belum dihitung';
  const start = new Date(masukSejak);
  if (Number.isNaN(start.getTime())) return 'Belum dihitung';

  const diffMs = Math.max(0, now.getTime() - start.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days < 1) return 'Hari ini';
  if (days < 30) return `${days} hari`;
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
