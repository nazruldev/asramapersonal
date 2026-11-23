/** 0 = Minggu … 6 = Sabtu (sama dengan Date.getDay()) */
export const HARI_INDEKS = [0, 1, 2, 3, 4, 5, 6] as const;

export const HARI_LABELS: { index: number; short: string; label: string }[] = [
  { index: 0, short: 'Min', label: 'Minggu' },
  { index: 1, short: 'Sen', label: 'Senin' },
  { index: 2, short: 'Sel', label: 'Selasa' },
  { index: 3, short: 'Rab', label: 'Rabu' },
  { index: 4, short: 'Kam', label: 'Kamis' },
  { index: 5, short: 'Jum', label: 'Jumat' },
  { index: 6, short: 'Sab', label: 'Sabtu' },
];

export const ALL_DAYS: number[] = [...HARI_INDEKS];

const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Tampilan agenda tanpa emoji: singkatan teks atau inisial nama. */
export function kegiatanInitial(nama: string, icon?: string | null): string {
  const trimmedIcon = icon?.trim();
  if (trimmedIcon) {
    if (EMOJI_RE.test(trimmedIcon)) return trimmedIcon.slice(0, 2);
    return trimmedIcon.slice(0, 2).toUpperCase();
  }
  const n = nama.trim();
  return n ? n.charAt(0).toUpperCase() : '?';
}

export function kegiatanMarkIsEmoji(icon?: string | null): boolean {
  const trimmed = icon?.trim();
  return Boolean(trimmed && EMOJI_RE.test(trimmed));
}

export type KegiatanSchedule = {
  id: string;
  nama: string;
  jenis: string;
  waktu?: string;
  icon?: string;
  /** Hari aktif (0=Min … 6=Sab). Kosong = setiap hari */
  hari_aktif?: number[];
  jam_mulai?: string;
  jam_selesai?: string;
  urutan?: number;
  /** false = tidak muncul di halaman absensi */
  untuk_absensi?: boolean;
  /** 1 = setiap minggu (default); 2 = dua minggu sekali; dst. */
  interval_minggu?: number;
  /** YYYY-MM-DD di minggu aktif pertama; wajib jika interval_minggu > 1 */
  acuan_tanggal?: string;
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getDayIndexFromDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getDay();
}

export function isKegiatanActiveOnDay(hariAktif: number[] | undefined, dayIndex: number): boolean {
  if (!hariAktif || hariAktif.length === 0) return true;
  return hariAktif.includes(dayIndex);
}

/** Senin sebagai awal minggu (ISO-like). */
export function mondayOfWeekDateKey(dateKey: string): string | null {
  if (!DATE_KEY_RE.test(dateKey)) return null;
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay(); // 0=Min … 6=Sab
  const offsetFromMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offsetFromMonday);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function daysBetweenDateKeys(a: string, b: string): number | null {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function normalizeIntervalMinggu(raw?: number | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Apakah kegiatan masuk jadwal pada tanggal tertentu (hari + interval minggu).
 * Interval > 1 tanpa acuan_tanggal → tidak aktif.
 */
export function isKegiatanActiveOnDate(keg: KegiatanSchedule, dateKey: string): boolean {
  const day = getDayIndexFromDateKey(dateKey);
  if (!isKegiatanActiveOnDay(keg.hari_aktif, day)) return false;

  const interval = normalizeIntervalMinggu(keg.interval_minggu);
  if (interval <= 1) return true;

  const acuan = keg.acuan_tanggal?.trim();
  if (!acuan || !DATE_KEY_RE.test(acuan)) return false;

  const weekDate = mondayOfWeekDateKey(dateKey);
  const weekAcuan = mondayOfWeekDateKey(acuan);
  if (!weekDate || !weekAcuan) return false;

  const dayDiff = daysBetweenDateKeys(weekAcuan, weekDate);
  if (dayDiff === null) return false;
  const weekDiff = Math.floor(dayDiff / 7);
  // Modulo aman untuk weekDiff negatif
  return ((weekDiff % interval) + interval) % interval === 0;
}

export function formatWaktuKegiatan(jamMulai?: string, jamSelesai?: string): string {
  if (jamMulai && jamSelesai) return `${jamMulai} - ${jamSelesai}`;
  if (jamMulai) return `Mulai ${jamMulai}`;
  if (jamSelesai) return `Sampai ${jamSelesai}`;
  return '';
}

export function formatHariAktif(hariAktif?: number[]): string {
  if (!hariAktif || hariAktif.length === 0 || hariAktif.length === 7) {
    return 'Setiap hari';
  }
  const sorted = [...hariAktif].sort((a, b) => a - b);
  return sorted
    .map((d) => HARI_LABELS.find((h) => h.index === d)?.short ?? String(d))
    .join(', ');
}

export function formatIntervalMinggu(intervalMinggu?: number): string {
  const n = normalizeIntervalMinggu(intervalMinggu);
  if (n <= 1) return 'tiap minggu';
  return `tiap ${n} minggu`;
}

/** Ringkas untuk list: "Sen, Rab · tiap 2 minggu" */
export function formatKegiatanJadwalRingkas(keg: KegiatanSchedule): string {
  const hari = formatHariAktif(keg.hari_aktif);
  const interval = normalizeIntervalMinggu(keg.interval_minggu);
  if (interval <= 1) return hari;
  return `${hari} · ${formatIntervalMinggu(interval)}`;
}

export function compareKegiatanUrutan(a: KegiatanSchedule, b: KegiatanSchedule): number {
  const ua = a.urutan ?? 999;
  const ub = b.urutan ?? 999;
  if (ua !== ub) return ua - ub;
  const ta = a.jam_mulai ?? '99:99';
  const tb = b.jam_mulai ?? '99:99';
  if (ta !== tb) return ta.localeCompare(tb);
  return a.nama.localeCompare(b.nama, 'id');
}

export function sortKegiatanForAbsensi(list: KegiatanSchedule[]): KegiatanSchedule[] {
  return [...list].sort(compareKegiatanUrutan);
}

export function filterKegiatanForAbsensiDate(
  list: KegiatanSchedule[],
  dateKey: string
): KegiatanSchedule[] {
  return sortKegiatanForAbsensi(
    list.filter((k) => k.untuk_absensi !== false && isKegiatanActiveOnDate(k, dateKey))
  );
}

const JAM_MENIT_RE = /^(\d{1,2}):(\d{2})$/;

/** Parse "HH:mm" ke menit sejak 00:00. */
export function parseJamMenit(raw?: string | null): number | null {
  const s = raw?.trim();
  if (!s) return null;
  const m = JAM_MENIT_RE.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(min) ||
    h < 0 ||
    h > 23 ||
    min < 0 ||
    min > 59
  ) {
    return null;
  }
  return h * 60 + min;
}

export type KegiatanAbsensiWindowState = 'open' | 'belum_mulai' | 'selesai' | 'tanpa_jam' | 'hari_lalu';

export type KegiatanAbsensiWindow = {
  enabled: boolean;
  state: KegiatanAbsensiWindowState;
  /** Pesan singkat untuk UI */
  hint?: string;
};

/**
 * Apakah absensi boleh dicatat untuk kegiatan pada tanggal tertentu.
 * Hari lampau: selalu boleh (koreksi). Hari ini: sesuai jam_mulai–jam_selesai.
 */
export function evaluateKegiatanAbsensiWindow(
  keg: KegiatanSchedule,
  selectedDateKey: string,
  todayDateKey: string,
  nowMinutesOfDay: number
): KegiatanAbsensiWindow {
  if (selectedDateKey < todayDateKey) {
    return { enabled: true, state: 'hari_lalu' };
  }
  if (selectedDateKey > todayDateKey) {
    return {
      enabled: false,
      state: 'belum_mulai',
      hint: 'Tanggal belum tiba',
    };
  }

  const start = parseJamMenit(keg.jam_mulai);
  const end = parseJamMenit(keg.jam_selesai);

  if (start === null && end === null) {
    return { enabled: true, state: 'tanpa_jam' };
  }

  const effectiveStart = start ?? 0;
  let effectiveEnd = end ?? 24 * 60 - 1;
  if (start !== null && end !== null && end < start) {
    effectiveEnd += 24 * 60;
  }

  let compareNow = nowMinutesOfDay;
  if (start !== null && end !== null && end < start && nowMinutesOfDay < effectiveStart) {
    compareNow += 24 * 60;
  }

  if (compareNow < effectiveStart) {
    const jam = keg.jam_mulai?.trim() || '—';
    return {
      enabled: false,
      state: 'belum_mulai',
      hint: `Absensi dibuka pukul ${jam}`,
    };
  }
  if (compareNow > effectiveEnd) {
    const rentang = formatWaktuKegiatan(keg.jam_mulai, keg.jam_selesai) || keg.jam_selesai || '—';
    return {
      enabled: false,
      state: 'selesai',
      hint: `Di luar rentang (${rentang})`,
    };
  }

  return { enabled: true, state: 'open' };
}

const CLOSED_TAB_ORDER: Record<KegiatanAbsensiWindowState, number> = {
  open: 0,
  hari_lalu: 1,
  tanpa_jam: 2,
  belum_mulai: 3,
  selesai: 4,
};

/** Tab absensi: yang sedang buka dulu, lalu belum mulai, lalu sudah lewat. */
export function sortKegiatanForAbsensiTabs(
  list: KegiatanSchedule[],
  windowOf: (keg: KegiatanSchedule) => KegiatanAbsensiWindow
): KegiatanSchedule[] {
  return [...list].sort((a, b) => {
    const wa = windowOf(a);
    const wb = windowOf(b);
    const openA = wa.enabled ? 0 : 1;
    const openB = wb.enabled ? 0 : 1;
    if (openA !== openB) return openA - openB;
    if (!wa.enabled && !wb.enabled) {
      const sa = CLOSED_TAB_ORDER[wa.state] ?? 9;
      const sb = CLOSED_TAB_ORDER[wb.state] ?? 9;
      if (sa !== sb) return sa - sb;
    }
    return compareKegiatanUrutan(a, b);
  });
}

type DefaultKegiatanSeed = Omit<KegiatanSchedule, 'id' | 'waktu'> & { waktu?: string };

/** Template data awal absensi asrama (satu sumber untuk client & server). */
export const DEFAULT_KEGIATAN_ABSENSI_SEED: DefaultKegiatanSeed[] = [
  {
    nama: 'Masuk Asrama',
    jenis: 'Kegiatan',
    jam_mulai: '21:00',
    jam_selesai: '22:30',
    hari_aktif: ALL_DAYS,
    urutan: 1,
  },
  {
    nama: 'Subuh Berjamaah',
    jenis: 'Ibadah',
    waktu: 'Sesuai waktu sholat',
    jam_mulai: '04:30',
    jam_selesai: '05:30',
    hari_aktif: ALL_DAYS,
    urutan: 2,
  },
  {
    nama: 'Dzuhur Berjamaah',
    jenis: 'Ibadah',
    waktu: 'Sesuai waktu sholat',
    jam_mulai: '12:00',
    jam_selesai: '12:45',
    hari_aktif: ALL_DAYS,
    urutan: 3,
  },
  {
    nama: 'Ashar Berjamaah',
    jenis: 'Ibadah',
    waktu: 'Sesuai waktu sholat',
    jam_mulai: '15:15',
    jam_selesai: '15:45',
    hari_aktif: ALL_DAYS,
    urutan: 4,
  },
  {
    nama: 'Maghrib & Wirid',
    jenis: 'Ibadah',
    waktu: 'Sesuai waktu sholat',
    jam_mulai: '18:15',
    jam_selesai: '19:00',
    hari_aktif: ALL_DAYS,
    urutan: 5,
  },
  {
    nama: 'Isya Berjamaah',
    jenis: 'Ibadah',
    waktu: 'Sesuai waktu sholat',
    jam_mulai: '19:30',
    jam_selesai: '20:15',
    hari_aktif: ALL_DAYS,
    urutan: 6,
  },
  {
    nama: 'Tahfidz',
    jenis: 'Belajar',
    jam_mulai: '05:45',
    jam_selesai: '06:30',
    hari_aktif: ALL_DAYS,
    urutan: 7,
  },
  {
    nama: 'Muhadarah',
    jenis: 'Belajar',
    jam_mulai: '19:00',
    jam_selesai: '20:00',
    hari_aktif: [1, 4],
    urutan: 8,
  },
  {
    nama: 'Apel Malam',
    jenis: 'Kegiatan',
    jam_mulai: '21:30',
    jam_selesai: '22:00',
    hari_aktif: ALL_DAYS,
    urutan: 9,
  },
];

const DEFAULT_KEGIATAN_STABLE_IDS = [
  'seed-keg-masuk-asrama',
  'seed-keg-subuh',
  'seed-keg-dzuhur',
  'seed-keg-ashar',
  'seed-keg-maghrib',
  'seed-keg-isya',
  'seed-keg-tahfidz',
  'seed-keg-muhadarah',
  'seed-keg-apel-malam',
] as const;

export function buildDefaultKegiatanRecords(
  newId: () => string,
  options?: { stableIds?: boolean }
): KegiatanSchedule[] {
  return DEFAULT_KEGIATAN_ABSENSI_SEED.map((seed, index) => {
    const waktu = seed.waktu ?? formatWaktuKegiatan(seed.jam_mulai, seed.jam_selesai);
    const id =
      options?.stableIds && index < DEFAULT_KEGIATAN_STABLE_IDS.length
        ? DEFAULT_KEGIATAN_STABLE_IDS[index]
        : newId();
    return {
      id,
      ...seed,
      waktu,
      untuk_absensi: seed.untuk_absensi ?? true,
    };
  });
}
