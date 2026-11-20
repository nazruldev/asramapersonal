import {
  DEFAULT_PASSWORD_HASH,
  type SecurityQuestionsTriple,
} from '@/lib/app-auth';
import {
  DEFAULT_INDONESIA_TIMEZONE,
  normalizeIndonesiaTimezone,
  type IndonesiaTimezoneId,
} from '@/lib/indonesia-timezone';

export const JENIS_ASRAMA_OPTIONS = ['PUTRA', 'PUTRI', 'CAMPUR'] as const;
export type JenisAsrama = (typeof JENIS_ASRAMA_OPTIONS)[number];

export function normalizeJenisAsrama(value: string): JenisAsrama | '' {
  const upper = value.trim().toUpperCase();
  if (!upper) return '';
  if ((JENIS_ASRAMA_OPTIONS as readonly string[]).includes(upper)) {
    return upper as JenisAsrama;
  }
  return '';
}

/** Role akun pengguna aplikasi. */
export type PenggunaRole = 'super_admin' | 'bendahara' | 'pengawas';

export const PENGGUNA_ROLE_OPTIONS: { id: PenggunaRole; label: string }[] = [
  { id: 'super_admin', label: 'Super Admin' },
  { id: 'bendahara', label: 'Bendahara' },
  { id: 'pengawas', label: 'Pengawas' },
];

export function penggunaRoleLabel(role: PenggunaRole): string {
  return PENGGUNA_ROLE_OPTIONS.find((r) => r.id === role)?.label ?? role;
}

/** Kunci modul untuk hak akses pengawas (checklist per modul). */
export type ModulAkses =
  | 'santri'
  | 'kamar'
  | 'kelas'
  | 'kegiatan'
  | 'absensi'
  | 'izin'
  | 'pembinaan'
  | 'pembayaran'
  | 'penjadwalan'
  | 'laporan'
  | 'kesehatan'
  | 'pengaturan'
  | 'database';

export const MODUL_AKSES_OPTIONS: { id: ModulAkses; label: string }[] = [
  { id: 'santri', label: 'Data Santri' },
  { id: 'kamar', label: 'Data Kamar' },
  { id: 'kelas', label: 'Data Kelas' },
  { id: 'kegiatan', label: 'Data Kegiatan' },
  { id: 'absensi', label: 'Absensi' },
  { id: 'izin', label: 'Izin Keluar' },
  { id: 'pembinaan', label: 'Pelanggaran & Pembinaan' },
  { id: 'pembayaran', label: 'Pembayaran' },
  { id: 'penjadwalan', label: 'Penjadwalan' },
  { id: 'laporan', label: 'Laporan' },
  { id: 'kesehatan', label: 'Kesehatan' },
  { id: 'pengaturan', label: 'Pengaturan' },
  { id: 'database', label: 'Cadangan Data' },
];

export type Asrama = {
  id: string;
  nama: string;
  jenis?: string;
  alamat?: string;
};

export type Pengguna = {
  id: string;
  nama: string;
  role: PenggunaRole;
  /** Hash PIN/kata sandi (hashSecretSync). */
  pinHash: string;
  /** Asrama yang ditugaskan; kosong = semua asrama. */
  asramaIds: string[];
  /** Modul yang boleh diakses (diabaikan untuk super_admin). */
  akses: ModulAkses[];
  aktif: boolean;
};

export type AppSettings = {
  namaAsrama: string;
  jenisAsrama: string;
  /** Zona waktu Indonesia (IANA), default WITA */
  zonaWaktu: IndonesiaTimezoneId;
  /** false = tampilkan wizard pertama kali; undefined pada data lama = sudah selesai */
  setupSelesai?: boolean;
  /** Batas akumulasi pelanggaran per tingkat (mis. 3, 5, 7) */
  batasPelanggaran: [number, number, number];
  namaTingkat: [string, string, string];
  /** Jika false, modul BK fokus pelanggaran & teguran saja */
  tampilkanPrestasi: boolean;
  /** Kunci layar aplikasi (hash lokal) */
  passwordHash: string;
  /** Tiga pertanyaan pemulihan kata sandi */
  securityQuestions: SecurityQuestionsTriple;
  /** Daftar asrama (multi-asrama). */
  asrama: Asrama[];
  /** Akun pengguna (super admin & pengawas). */
  pengguna: Pengguna[];
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  namaAsrama: 'Asrama Putra',
  jenisAsrama: '',
  zonaWaktu: DEFAULT_INDONESIA_TIMEZONE,
  batasPelanggaran: [3, 5, 7],
  namaTingkat: ['Peringatan', 'Teguran Resmi', 'Skors / Pembinaan Khusus'],
  tampilkanPrestasi: false,
  passwordHash: DEFAULT_PASSWORD_HASH,
  securityQuestions: [null, null, null],
  asrama: [],
  pengguna: [],
  setupSelesai: false,
};

export const ONBOARDING_DONE_STORAGE_KEY = 'asrama_manager_onboarding_done';

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isOnboardingMarkedComplete(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Data lama tanpa flag dianggap sudah lewat wizard; instalasi baru pakai setupSelesai: false. */
export function isSetupSelesai(partial?: Partial<AppSettings> | null): boolean {
  if (isOnboardingMarkedComplete()) return true;
  if (!partial) return true;
  if (partial.setupSelesai === false) return false;
  if (partial.setupSelesai === true) return true;
  const sandiDiubah = Boolean(
    partial.passwordHash &&
      partial.passwordHash.length > 0 &&
      partial.passwordHash !== DEFAULT_PASSWORD_HASH
  );
  if (sandiDiubah) return true;
  return true;
}

/** Gabungkan simpanan pengaturan dengan default & normalisasi zona waktu. */
export function mergeAppSettings(partial?: Partial<AppSettings> | Record<string, unknown>): AppSettings {
  const merged = { ...DEFAULT_APP_SETTINGS, ...partial } as AppSettings;
  merged.asrama = Array.isArray(merged.asrama) ? merged.asrama : [];
  merged.pengguna = (Array.isArray(merged.pengguna) ? merged.pengguna : []).map((p) => ({
    ...p,
    asramaIds: Array.isArray(p.asramaIds) ? p.asramaIds : [],
    akses: Array.isArray(p.akses) ? p.akses : [],
    aktif: p.aktif !== false,
  }));
  const setupSelesai =
    partial && typeof (partial as Partial<AppSettings>).setupSelesai === 'boolean'
      ? (partial as Partial<AppSettings>).setupSelesai!
      : isSetupSelesai(merged);
  return {
    ...merged,
    setupSelesai,
    zonaWaktu: normalizeIndonesiaTimezone(merged.zonaWaktu),
    jenisAsrama: normalizeJenisAsrama(merged.jenisAsrama),
  };
}

export function getPelanggaranTier(
  count: number,
  settings: AppSettings
): { level: number; label: string } | null {
  if (count <= 0) return null;
  const [t1, t2, t3] = settings.batasPelanggaran;
  const labels = settings.namaTingkat;
  if (count >= t3) return { level: 3, label: labels[2] };
  if (count >= t2) return { level: 2, label: labels[1] };
  if (count >= t1) return { level: 1, label: labels[0] };
  return { level: 0, label: `${count} pelanggaran` };
}
