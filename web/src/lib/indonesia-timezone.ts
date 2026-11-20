export const INDONESIA_TIMEZONES = [
  {
    id: 'Asia/Jakarta',
    shortLabel: 'WIB',
    name: 'Waktu Indonesia Barat',
    utcOffset: 'UTC+7',
    hint: 'Jawa, Sumatra, Kalimantan barat & tengah',
  },
  {
    id: 'Asia/Makassar',
    shortLabel: 'WITA',
    name: 'Waktu Indonesia Tengah',
    utcOffset: 'UTC+8',
    hint: 'Bali, Nusa Tenggara, Sulawesi, Kalimantan timur & utara',
  },
  {
    id: 'Asia/Jayapura',
    shortLabel: 'WIT',
    name: 'Waktu Indonesia Timur',
    utcOffset: 'UTC+9',
    hint: 'Papua & Maluku',
  },
] as const;

export type IndonesiaTimezoneId = (typeof INDONESIA_TIMEZONES)[number]['id'];

export const DEFAULT_INDONESIA_TIMEZONE: IndonesiaTimezoneId = 'Asia/Makassar';

export function normalizeIndonesiaTimezone(value: unknown): IndonesiaTimezoneId {
  if (typeof value !== 'string') return DEFAULT_INDONESIA_TIMEZONE;
  const found = INDONESIA_TIMEZONES.find((z) => z.id === value);
  return found?.id ?? DEFAULT_INDONESIA_TIMEZONE;
}

export function getIndonesiaTimezoneMeta(id: string) {
  return INDONESIA_TIMEZONES.find((z) => z.id === id) ?? INDONESIA_TIMEZONES[1];
}

/** Tanggal (yyyy-MM-dd) dan menit dalam hari (0–1439) menurut zona waktu app. */
export function getZonedClock(
  now: Date,
  zonaWaktu: string
): { dateKey: string; minutesOfDay: number } {
  const tz = normalizeIndonesiaTimezone(zonaWaktu);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  const year = pick('year');
  const month = pick('month').padStart(2, '0');
  const day = pick('day').padStart(2, '0');
  const hour = Number(pick('hour'));
  const minute = Number(pick('minute'));
  return {
    dateKey: `${year}-${month}-${day}`,
    minutesOfDay: hour * 60 + minute,
  };
}

export function formatDateTimeInZona(
  input: string | Date,
  zonaWaktu: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return typeof input === 'string' ? input : '';
  const tz = normalizeIndonesiaTimezone(zonaWaktu);
  return d.toLocaleString('id-ID', {
    timeZone: tz,
    ...options,
  });
}
