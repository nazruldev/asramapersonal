import type { ModulAkses, Pengguna, PenggunaRole } from './app-settings';

export const DEFAULT_APP_PASSWORD = '12345';

/** Panjang PIN / kata sandi akun (login & manajemen pengguna). */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

/** Null jika valid; pesan error jika terlalu pendek/panjang. */
export function pinLengthError(pin: string): string | null {
  const len = pin.trim().length;
  if (len < PIN_MIN_LENGTH) return `PIN minimal ${PIN_MIN_LENGTH} digit`;
  if (len > PIN_MAX_LENGTH) return `PIN maksimal ${PIN_MAX_LENGTH} digit`;
  return null;
}

/** Batasi input PIN ke digit saja, max PIN_MAX_LENGTH. */
export function clampPinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH);
}

/** Hash sinkron untuk penyimpanan lokal (bukan keamanan server). */
export function hashSecretSync(value: string): string {
  const normalized = normalizeAnswer(value);
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  return `djb2:${(hash >>> 0).toString(16)}:${normalized.length}`;
}

export const DEFAULT_PASSWORD_HASH = hashSecretSync(DEFAULT_APP_PASSWORD);

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function verifySecret(input: string, storedHash: string | undefined | null): boolean {
  const expected = storedHash && storedHash.length > 0 ? storedHash : DEFAULT_PASSWORD_HASH;
  return hashSecretSync(input) === expected;
}

export type SecurityQuestionId =
  | 'tanggal_lahir'
  | 'warna_favorit'
  | 'film_favorit'
  | 'tim_kesayangan'
  | 'nama_ayah'
  | 'nama_ibu'
  | 'nama_panggilan'
  | 'kota_kelahiran'
  | 'makanan_favorit'
  | 'sekolah_asal'
  | 'nama_guru_favorit'
  | 'hobi_utama'
  | 'nama_saudara'
  | 'nomor_hp_aktif'
  | 'nama_madrasah';

export type SecurityQuestionEntry = {
  questionId: SecurityQuestionId;
  answerHash: string;
};

export const SECURITY_QUESTION_OPTIONS: { id: SecurityQuestionId; label: string }[] = [
  { id: 'tanggal_lahir', label: 'Berapa tanggal lahir Anda? (contoh: 15-08-2008)' },
  { id: 'warna_favorit', label: 'Apa warna favorit Anda?' },
  { id: 'film_favorit', label: 'Apa film atau serial favorit Anda?' },
  { id: 'tim_kesayangan', label: 'Siapa tim olahraga kesayangan Anda?' },
  { id: 'nama_ayah', label: 'Siapa nama ayah Anda?' },
  { id: 'nama_ibu', label: 'Siapa nama ibu Anda?' },
  { id: 'nama_panggilan', label: 'Apa nama panggilan Anda sehari-hari?' },
  { id: 'kota_kelahiran', label: 'Di kota mana Anda dilahirkan?' },
  { id: 'makanan_favorit', label: 'Apa makanan favorit Anda?' },
  { id: 'sekolah_asal', label: 'Apa nama sekolah asal Anda?' },
  { id: 'nama_guru_favorit', label: 'Siapa nama guru favorit Anda?' },
  { id: 'hobi_utama', label: 'Apa hobi utama Anda?' },
  { id: 'nama_saudara', label: 'Siapa nama saudara kandung Anda?' },
  { id: 'nomor_hp_aktif', label: 'Berapa nomor HP aktif Anda?' },
  { id: 'nama_madrasah', label: 'Apa nama madrasah / pesantren asal Anda?' },
];

export function securityQuestionLabel(id: SecurityQuestionId): string {
  return SECURITY_QUESTION_OPTIONS.find((q) => q.id === id)?.label ?? id;
}

export type SecurityQuestionsTriple = [
  SecurityQuestionEntry | null,
  SecurityQuestionEntry | null,
  SecurityQuestionEntry | null,
];

export function isSecurityQuestionsComplete(questions: SecurityQuestionsTriple | undefined): boolean {
  if (!questions || questions.length !== 3) return false;
  return questions.every((q) => q && q.questionId && q.answerHash);
}

export function verifySecurityAnswers(
  questions: SecurityQuestionsTriple | undefined,
  answers: { questionId: SecurityQuestionId; answer: string }[]
): boolean {
  if (!isSecurityQuestionsComplete(questions)) return false;
  const configured = questions!;
  if (answers.length !== 3) return false;
  for (const entry of configured) {
    if (!entry) return false;
    const given = answers.find((a) => a.questionId === entry.questionId);
    if (!given || !verifySecret(given.answer, entry.answerHash)) return false;
  }
  return true;
}

export const AUTH_SESSION_KEY = 'asrama_manager_authenticated';
const SESSION_USER_KEY = 'asrama_manager_session_user';

/**
 * Storage persisten untuk sesi login.
 * sessionStorage hilang tiap tutup tab/WebView/Electron → user harus login terus.
 * localStorage bertahan sampai logout eksplisit.
 */
function authStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Pindahkan sisa sesi lama dari sessionStorage → localStorage (sekali). */
function migrateSessionStorageAuth(): void {
  if (typeof window === 'undefined') return;
  try {
    const ss = window.sessionStorage;
    const ls = window.localStorage;
    const flag = ss.getItem(AUTH_SESSION_KEY);
    if (flag && !ls.getItem(AUTH_SESSION_KEY)) ls.setItem(AUTH_SESSION_KEY, flag);
    const user = ss.getItem(SESSION_USER_KEY);
    if (user && !ls.getItem(SESSION_USER_KEY)) ls.setItem(SESSION_USER_KEY, user);
    ss.removeItem(AUTH_SESSION_KEY);
    ss.removeItem(SESSION_USER_KEY);
  } catch {
    /* ignore */
  }
}

/** Akun yang sedang login (disimpan di localStorage agar tahan buka ulang app). */
export type SessionUser = {
  id: string;
  nama: string;
  role: PenggunaRole;
  akses: ModulAkses[];
  asramaIds: string[];
  /** Asrama yang sedang dilihat/dikelola. */
  activeAsramaId: string | null;
};

export function sessionUserFromPengguna(p: Pengguna, activeAsramaId?: string | null): SessionUser {
  const asramaIds = Array.isArray(p.asramaIds) ? p.asramaIds : [];
  return {
    id: p.id,
    nama: p.nama,
    role: p.role,
    akses: Array.isArray(p.akses) ? p.akses : [],
    asramaIds,
    activeAsramaId:
      activeAsramaId !== undefined
        ? activeAsramaId
        : p.role === 'pengawas' || (p.role === 'bendahara' && asramaIds.length === 1)
          ? (asramaIds[0] ?? null)
          : null,
  };
}

const sessionListeners = new Set<() => void>();

export function subscribeSessionUser(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

function notifySessionChanged(): void {
  sessionListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function setSessionUser(user: SessionUser | null): void {
  try {
    const store = authStore();
    if (!store) return;
    if (user) store.setItem(SESSION_USER_KEY, JSON.stringify(user));
    else store.removeItem(SESSION_USER_KEY);
  } catch {
    /* ignore */
  }
  notifySessionChanged();
}

/** Nama akun yang sedang login untuk kolom audit created_by/updated_by. */
export function currentActorName(): string | null {
  const u = getSessionUser();
  return u?.nama ?? u?.id ?? null;
}

export function getSessionUser(): SessionUser | null {
  try {
    migrateSessionStorageAuth();
    const raw = authStore()?.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed || !parsed.id || !parsed.role) return null;
    return {
      ...parsed,
      akses: Array.isArray(parsed.akses) ? parsed.akses : [],
      asramaIds: Array.isArray(parsed.asramaIds) ? parsed.asramaIds : [],
      activeAsramaId: parsed.activeAsramaId ?? null,
    };
  } catch {
    return null;
  }
}

export async function setActiveAsramaId(asramaId: string | null): Promise<void> {
  const user = getSessionUser();
  if (!user) return;
  setSessionUser({ ...user, activeAsramaId: asramaId });
  // Scope asrama berubah → pull ulang dari Turso sesuai scope (wajib online).
  const { runTursoSync } = await import('@/lib/sync/turso-sync');
  await runTursoSync();
  const { pullPembayaranFromTurso } = await import('@/lib/pembayaran-store');
  await pullPembayaranFromTurso();
}

/** Super admin selalu punya akses penuh; pengawas dibatasi checklist modul. */
export function hasModuleAccess(user: SessionUser | null | undefined, modul: ModulAkses): boolean {
  // Tanpa sesi akun (wizard/login legacy) = admin penuh
  if (!user) return true;
  if (user.role === 'super_admin') return true;
  return user.akses.includes(modul);
}

/** Pemetaan path route → modul hak akses (null = bebas/admin-only ditangani khusus). */
export function requiredModuleForPath(pathname: string): ModulAkses | null {
  if (pathname.startsWith('/master/santri')) return 'santri';
  if (pathname.startsWith('/master/kamar')) return 'kamar';
  if (pathname.startsWith('/master/kelas')) return 'kelas';
  if (pathname.startsWith('/master/kegiatan')) return 'kegiatan';
  if (pathname.startsWith('/master/pembayaran')) return 'pembayaran';
  if (pathname.startsWith('/laporan/absensi')) return 'absensi';
  if (pathname.startsWith('/laporan/izin')) return 'izin';
  if (pathname.startsWith('/laporan/pembinaan')) return 'pembinaan';
  if (pathname === '/laporan/peringkat' || pathname === '/laporan/wilayah' || pathname === '/laporan')
    return 'laporan';
  if (pathname.startsWith('/penjadwalan')) return 'penjadwalan';
  if (pathname === '/pengaturan') return 'pengaturan';
  if (pathname === '/database') return 'database';
  return null;
}

export function markAuthenticated(): void {
  try {
    const store = authStore();
    if (!store) return;
    store.setItem(AUTH_SESSION_KEY, '1');
    // Bersihkan sisa sessionStorage lama jika ada.
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

export function clearAuthenticated(): void {
  try {
    authStore()?.removeItem(AUTH_SESSION_KEY);
    authStore()?.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
  } catch {
    /* ignore */
  }
  setSessionUser(null);
}

export function isAuthenticatedSession(): boolean {
  try {
    migrateSessionStorageAuth();
    if (authStore()?.getItem(AUTH_SESSION_KEY) !== '1') return false;
    // Flag saja tidak cukup — harus ada akun sesi yang valid.
    return getSessionUser() !== null;
  } catch {
    return false;
  }
}
