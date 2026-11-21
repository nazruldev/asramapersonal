import {
  DEFAULT_PASSWORD_HASH,
  hashSecretSync,
  isSecurityQuestionsComplete,
  pinLengthError,
  verifySecret,
  verifySecurityAnswers,
  type SecurityQuestionId,
} from '@/lib/app-auth';
import type { AppSettings, Asrama, ModulAkses, Pengguna } from '@/lib/app-settings';

type ApiResult = { status: number; body: unknown };

/** Pastikan ada minimal 1 asrama & 1 super admin (migrasi dari kata sandi lama). */
export function ensureAccountsSeeded(
  settings: AppSettings,
  newId: () => string
): boolean {
  let mutated = false;
  if (!Array.isArray(settings.asrama)) settings.asrama = [];
  if (!Array.isArray(settings.pengguna)) settings.pengguna = [];
  if (settings.asrama.length === 0) {
    settings.asrama.push({
      id: newId(),
      nama: settings.namaAsrama?.trim() || 'Asrama Utama',
      jenis: settings.jenisAsrama || '',
    });
    mutated = true;
  }
  if (!settings.pengguna.some((p) => p.role === 'super_admin')) {
    settings.pengguna.push({
      id: newId(),
      nama: 'Administrator',
      role: 'super_admin',
      pinHash: settings.passwordHash || DEFAULT_PASSWORD_HASH,
      asramaIds: [],
      akses: [],
      aktif: true,
    });
    mutated = true;
  }
  return mutated;
}

export function defaultAsramaId(settings: AppSettings): string | null {
  return settings.asrama[0]?.id ?? null;
}

/** Samakan hash kata sandi legacy dengan PIN super admin pertama. */
function syncLegacyPasswordHash(settings: AppSettings): void {
  const admin = settings.pengguna.find((p) => p.role === 'super_admin');
  if (admin) settings.passwordHash = admin.pinHash;
}

function pinTaken(settings: AppSettings, pinHash: string, excludeId?: string): boolean {
  return settings.pengguna.some((p) => p.id !== excludeId && p.pinHash === pinHash);
}

const publicPengguna = (p: Pengguna) => ({
  id: p.id,
  nama: p.nama,
  role: p.role,
  asramaIds: p.asramaIds,
  akses: p.akses,
  aktif: p.aktif,
});

export function handleAuthAccounts(settings: AppSettings): ApiResult {
  return {
    status: 200,
    body: settings.pengguna
      .filter((p) => p.aktif !== false)
      .map((p) => ({ id: p.id, nama: p.nama, role: p.role })),
  };
}

export function handleAuthLoginAccount(
  settings: AppSettings,
  id: string,
  pin: string
): ApiResult {
  const user = settings.pengguna.find((p) => p.id === id && p.aktif !== false);
  if (!user) return { status: 404, body: { ok: false, error: 'Akun tidak ditemukan' } };
  if (!verifySecret(pin, user.pinHash)) {
    return { status: 401, body: { ok: false, error: 'PIN salah' } };
  }
  return { status: 200, body: { ok: true, user: publicPengguna(user) } };
}

export function handleAsramaList(settings: AppSettings): ApiResult {
  return { status: 200, body: settings.asrama };
}

export function handleAsramaCreate(
  settings: AppSettings,
  body: Record<string, unknown>,
  newId: () => string
): ApiResult {
  const nama = String(body.nama ?? '').trim();
  if (!nama) return { status: 400, body: { error: 'Nama asrama wajib diisi' } };
  const item: Asrama = {
    id: newId(),
    nama,
    jenis: String(body.jenis ?? '').trim(),
    alamat: body.alamat ? String(body.alamat).trim() : undefined,
  };
  settings.asrama.push(item);
  return { status: 200, body: item };
}

export function handleAsramaUpdate(
  settings: AppSettings,
  id: string,
  body: Record<string, unknown>
): ApiResult {
  const item = settings.asrama.find((a) => a.id === id);
  if (!item) return { status: 404, body: { error: 'Asrama tidak ditemukan' } };
  const nama = String(body.nama ?? item.nama).trim();
  if (!nama) return { status: 400, body: { error: 'Nama asrama wajib diisi' } };
  item.nama = nama;
  if (body.jenis !== undefined) item.jenis = String(body.jenis).trim();
  if (body.alamat !== undefined) item.alamat = String(body.alamat).trim();
  return { status: 200, body: item };
}

export function handleAsramaDelete(
  settings: AppSettings,
  id: string,
  inUse: boolean
): ApiResult {
  if (settings.asrama.length <= 1) {
    return { status: 400, body: { error: 'Minimal harus ada satu asrama' } };
  }
  if (inUse) {
    return {
      status: 400,
      body: { error: 'Asrama masih dipakai santri/kamar. Pindahkan dulu datanya.' },
    };
  }
  settings.asrama = settings.asrama.filter((a) => a.id !== id);
  for (const p of settings.pengguna) {
    p.asramaIds = p.asramaIds.filter((a) => a !== id);
  }
  return { status: 200, body: { ok: true } };
}

export function handlePenggunaList(settings: AppSettings): ApiResult {
  return { status: 200, body: settings.pengguna.map(publicPengguna) };
}

type PenggunaBody = {
  nama?: unknown;
  pin?: unknown;
  role?: unknown;
  asramaIds?: unknown;
  akses?: unknown;
  aktif?: unknown;
};

function normalizeAkses(value: unknown): ModulAkses[] {
  return Array.isArray(value) ? (value as ModulAkses[]) : [];
}

function normalizeAsramaIds(settings: AppSettings, value: unknown): string[] {
  const valid = new Set(settings.asrama.map((a) => a.id));
  return Array.isArray(value) ? (value as string[]).filter((id) => valid.has(id)) : [];
}

function normalizeRole(value: unknown): Pengguna['role'] {
  return value === 'super_admin' || value === 'bendahara' ? value : 'pengawas';
}

export function handlePenggunaCreate(
  settings: AppSettings,
  body: PenggunaBody,
  newId: () => string
): ApiResult {
  const nama = String(body.nama ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  if (!nama) return { status: 400, body: { error: 'Nama pengguna wajib diisi' } };
  const createPinErr = pinLengthError(pin);
  if (createPinErr) return { status: 400, body: { error: createPinErr } };
  const role = normalizeRole(body.role);
  const asramaIds = normalizeAsramaIds(settings, body.asramaIds);
  if (role === 'pengawas' && asramaIds.length !== 1) {
    return { status: 400, body: { error: 'Pengawas wajib ditugaskan ke tepat 1 asrama' } };
  }
  const pinHash = hashSecretSync(pin);
  if (pinTaken(settings, pinHash)) {
    return { status: 400, body: { error: 'PIN sudah dipakai akun lain. Gunakan PIN berbeda.' } };
  }
  const item: Pengguna = {
    id: newId(),
    nama,
    role,
    pinHash,
    asramaIds: role === 'super_admin' ? [] : asramaIds,
    akses: normalizeAkses(body.akses),
    aktif: body.aktif !== false,
  };
  settings.pengguna.push(item);
  return { status: 200, body: publicPengguna(item) };
}

export function handlePenggunaUpdate(
  settings: AppSettings,
  id: string,
  body: PenggunaBody
): ApiResult {
  const item = settings.pengguna.find((p) => p.id === id);
  if (!item) return { status: 404, body: { error: 'Pengguna tidak ditemukan' } };
  if (body.nama !== undefined) {
    const nama = String(body.nama).trim();
    if (!nama) return { status: 400, body: { error: 'Nama pengguna wajib diisi' } };
    item.nama = nama;
  }
  const nextRole =
    item.role === 'super_admin' ? 'super_admin' : normalizeRole(body.role ?? item.role);
  const nextAsramaIds =
    body.asramaIds !== undefined
      ? normalizeAsramaIds(settings, body.asramaIds)
      : item.asramaIds;
  if (nextRole === 'pengawas' && nextAsramaIds.length !== 1) {
    return { status: 400, body: { error: 'Pengawas wajib ditugaskan ke tepat 1 asrama' } };
  }
  item.role = nextRole;
  item.asramaIds = nextRole === 'super_admin' ? [] : nextAsramaIds;
  if (body.akses !== undefined) item.akses = normalizeAkses(body.akses);
  if (body.aktif !== undefined) item.aktif = body.aktif !== false;
  if (body.pin !== undefined && String(body.pin).trim()) {
    const pin = String(body.pin).trim();
    const updatePinErr = pinLengthError(pin);
    if (updatePinErr) return { status: 400, body: { error: updatePinErr } };
    const pinHash = hashSecretSync(pin);
    if (pinTaken(settings, pinHash, id)) {
      return { status: 400, body: { error: 'PIN sudah dipakai akun lain. Gunakan PIN berbeda.' } };
    }
    item.pinHash = pinHash;
    if (item.role === 'super_admin') syncLegacyPasswordHash(settings);
  }
  return { status: 200, body: publicPengguna(item) };
}

export function handlePenggunaDelete(settings: AppSettings, id: string): ApiResult {
  const item = settings.pengguna.find((p) => p.id === id);
  if (!item) return { status: 404, body: { error: 'Pengguna tidak ditemukan' } };
  if (item.role === 'super_admin') {
    const admins = settings.pengguna.filter((p) => p.role === 'super_admin');
    if (admins.length <= 1) {
      return { status: 400, body: { error: 'Minimal harus ada satu super admin' } };
    }
  }
  settings.pengguna = settings.pengguna.filter((p) => p.id !== id);
  if (item.role === 'super_admin') syncLegacyPasswordHash(settings);
  return { status: 200, body: { ok: true } };
}

/** Reset PIN oleh super admin (tanpa PIN lama). */
export function handlePenggunaResetPin(
  settings: AppSettings,
  id: string,
  newPin: string
): ApiResult {
  const item = settings.pengguna.find((p) => p.id === id);
  if (!item) return { status: 404, body: { error: 'Pengguna tidak ditemukan' } };
  const pin = newPin.trim();
  const resetPinErr = pinLengthError(pin);
  if (resetPinErr) return { status: 400, body: { error: resetPinErr } };
  const pinHash = hashSecretSync(pin);
  if (pinTaken(settings, pinHash, id)) {
    return { status: 400, body: { error: 'PIN sudah dipakai akun lain. Gunakan PIN berbeda.' } };
  }
  item.pinHash = pinHash;
  if (item.role === 'super_admin') syncLegacyPasswordHash(settings);
  return { status: 200, body: { ok: true } };
}

/** Ganti PIN sendiri oleh pengawas (butuh PIN lama). */
export function handlePenggunaChangePin(
  settings: AppSettings,
  id: string,
  currentPin: string,
  newPin: string
): ApiResult {
  const item = settings.pengguna.find((p) => p.id === id);
  if (!item) return { status: 404, body: { ok: false, error: 'Pengguna tidak ditemukan' } };
  if (!verifySecret(currentPin, item.pinHash)) {
    return { status: 401, body: { ok: false, error: 'PIN saat ini salah' } };
  }
  const pin = newPin.trim();
  const changePinErr = pinLengthError(pin);
  if (changePinErr) return { status: 400, body: { ok: false, error: changePinErr } };
  const pinHash = hashSecretSync(pin);
  if (pinTaken(settings, pinHash, id)) {
    return { status: 400, body: { ok: false, error: 'PIN sudah dipakai akun lain' } };
  }
  item.pinHash = pinHash;
  if (item.role === 'super_admin') syncLegacyPasswordHash(settings);
  return { status: 200, body: { ok: true } };
}

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
  const pwdErr = pinLengthError(newPassword || '');
  if (pwdErr) {
    return {
      status: 400,
      body: { ok: false, error: pwdErr.replace(/^PIN/, 'Kata sandi') },
    };
  }
  const newHash = hashSecretSync(newPassword);
  settings.passwordHash = newHash;
  const admin = settings.pengguna?.find((p) => p.role === 'super_admin');
  if (admin) admin.pinHash = newHash;
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
  for (const p of settings.pengguna ?? []) {
    if (p.role === 'super_admin') p.pinHash = DEFAULT_PASSWORD_HASH;
  }
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
