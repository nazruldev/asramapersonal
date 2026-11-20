import { Capacitor } from '@capacitor/core';
import type { ModulAkses, Pengguna, PenggunaRole } from './app-settings';

export const DEFAULT_APP_PASSWORD = '12345';

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

/** Akun yang sedang login (disimpan di sessionStorage). */
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
        : p.role === 'super_admin'
          ? null
          : (asramaIds[0] ?? null),
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
    if (user) sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_USER_KEY);
  } catch {
    /* ignore */
  }
  notifySessionChanged();
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
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

export function setActiveAsramaId(asramaId: string | null): void {
  const user = getSessionUser();
  if (!user) return;
  setSessionUser({ ...user, activeAsramaId: asramaId });
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

/** Hapus flag login lama di localStorage (rilis sebelumnya menyimpan di sana di APK). */
function purgeLegacyPersistentAuthFlag(): void {
  if (!Capacitor.isNativePlatform()) return;
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function markAuthenticated(): void {
  try {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(AUTH_SESSION_KEY, '1');
    purgeLegacyPersistentAuthFlag();
  } catch {
    /* ignore */
  }
}

export function clearAuthenticated(): void {
  try {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    /* ignore */
  }
  setSessionUser(null);
}

export function isAuthenticatedSession(): boolean {
  try {
    purgeLegacyPersistentAuthFlag();
    return sessionStorage.getItem(AUTH_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}
