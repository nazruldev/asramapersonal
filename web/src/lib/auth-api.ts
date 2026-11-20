import {
  DEFAULT_PASSWORD_HASH,
  hashSecretSync,
  isSecurityQuestionsComplete,
  verifySecret,
  verifySecurityAnswers,
  type SecurityQuestionId,
} from '@/lib/app-auth';
import type { AppSettings } from '@/lib/app-settings';

type ApiResult = { status: number; body: unknown };

export function handleAuthLogin(settings: AppSettings, password: string): ApiResult {
  const ok = verifySecret(password, settings.passwordHash);
  if (!ok) return { status: 401, body: { ok: false, error: 'Kata sandi salah' } };
  return { status: 200, body: { ok: true } };
}

export function handleAuthChangePassword(
  settings: AppSettings,
  currentPassword: string,
  newPassword: string
): ApiResult {
  if (!verifySecret(currentPassword, settings.passwordHash)) {
    return { status: 401, body: { ok: false, error: 'Kata sandi saat ini salah' } };
  }
  if (!newPassword || newPassword.length < 4) {
    return { status: 400, body: { ok: false, error: 'Kata sandi baru minimal 4 karakter' } };
  }
  settings.passwordHash = hashSecretSync(newPassword);
  return { status: 200, body: { ok: true } };
}

export function handleAuthRecoveryQuestions(settings: AppSettings): ApiResult {
  const configured = isSecurityQuestionsComplete(settings.securityQuestions);
  const questions = configured
    ? settings.securityQuestions.map((q) => ({ questionId: q!.questionId }))
    : [];
  return { status: 200, body: { configured, questions } };
}

export function handleAuthResetPassword(
  settings: AppSettings,
  answers: { questionId: SecurityQuestionId; answer: string }[]
): ApiResult {
  if (!isSecurityQuestionsComplete(settings.securityQuestions)) {
    return { status: 400, body: { ok: false, error: 'Pertanyaan keamanan belum diatur' } };
  }
  if (!verifySecurityAnswers(settings.securityQuestions, answers)) {
    return { status: 401, body: { ok: false, error: 'Jawaban tidak cocok' } };
  }
  settings.passwordHash = DEFAULT_PASSWORD_HASH;
  return { status: 200, body: { ok: true } };
}

export function handleAuthSecurityQuestions(
  settings: AppSettings,
  currentPassword: string,
  questions: { questionId: SecurityQuestionId; answer: string }[]
): ApiResult {
  if (!verifySecret(currentPassword, settings.passwordHash)) {
    return { status: 401, body: { ok: false, error: 'Kata sandi saat ini salah' } };
  }
  if (questions.length !== 3) {
    return { status: 400, body: { ok: false, error: 'Harus ada 3 pertanyaan' } };
  }
  const ids = questions.map((q) => q.questionId);
  if (new Set(ids).size !== 3) {
    return { status: 400, body: { ok: false, error: 'Pilih tiga pertanyaan berbeda' } };
  }
  for (const q of questions) {
    if (!q.answer.trim()) {
      return { status: 400, body: { ok: false, error: 'Semua jawaban wajib diisi' } };
    }
  }
  settings.securityQuestions = questions.map((q) => ({
    questionId: q.questionId,
    answerHash: hashSecretSync(q.answer),
  })) as AppSettings['securityQuestions'];
  return { status: 200, body: { ok: true } };
}

export function snapshotAuthSettings(settings: AppSettings): Pick<AppSettings, 'passwordHash' | 'securityQuestions'> {
  return {
    passwordHash: settings.passwordHash,
    securityQuestions: settings.securityQuestions,
  };
}
