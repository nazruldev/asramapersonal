import { hashSecretSync } from '@/lib/app-auth';
import {
  isSetupSelesai,
  markOnboardingComplete,
  mergeAppSettings,
  normalizeJenisAsrama,
  type AppSettings,
} from '@/lib/app-settings';
import { buildDefaultKelasRecords, type KelasRecord } from '@/lib/kelas-defaults';
import { normalizeIndonesiaTimezone, type IndonesiaTimezoneId } from '@/lib/indonesia-timezone';

type ApiResult = { status: number; body: unknown };

export type OnboardingCompleteBody = {
  namaAsrama: string;
  jenisAsrama: string;
  zonaWaktu: IndonesiaTimezoneId | string;
  newPassword: string;
  useDefaultKelas: boolean;
};

export function handleOnboardingComplete(
  ctx: { settings: AppSettings; kelas: KelasRecord[] },
  payload: OnboardingCompleteBody,
  createId: () => string
): ApiResult {
  if (isSetupSelesai(ctx.settings)) {
    return { status: 400, body: { ok: false, error: 'Pengaturan awal sudah selesai' } };
  }

  const nama = String(payload.namaAsrama ?? '').trim();
  if (!nama) {
    return { status: 400, body: { ok: false, error: 'Nama asrama wajib diisi' } };
  }

  const newPassword = String(payload.newPassword ?? '');
  if (newPassword.length < 4) {
    return { status: 400, body: { ok: false, error: 'Kata sandi baru minimal 4 karakter' } };
  }

  const nextSettings = mergeAppSettings({
    ...ctx.settings,
    namaAsrama: nama,
    jenisAsrama: normalizeJenisAsrama(payload.jenisAsrama),
    zonaWaktu: normalizeIndonesiaTimezone(payload.zonaWaktu),
    setupSelesai: true,
    passwordHash: hashSecretSync(newPassword),
  });
  Object.assign(ctx.settings, nextSettings);
  markOnboardingComplete();

  if (payload.useDefaultKelas && ctx.kelas.length === 0) {
    ctx.kelas.push(...buildDefaultKelasRecords(createId, { stableIds: true }));
  }

  return {
    status: 200,
    body: { ok: true, settings: ctx.settings, kelasCount: ctx.kelas.length },
  };
}
