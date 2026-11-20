import { Capacitor } from '@capacitor/core';

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
}

export function isAuthenticatedSession(): boolean {
  try {
    purgeLegacyPersistentAuthFlag();
    return sessionStorage.getItem(AUTH_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}
