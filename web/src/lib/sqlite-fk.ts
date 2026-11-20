/** Validasi & normalisasi foreign key untuk SQLite (APK). */

export class SqlForeignKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlForeignKeyError';
  }
}

export function coercePenjadwalanForeignKeys(
  row: Record<string, unknown>,
  santriIds: Set<string>,
  kamarIds: Set<string>
): Record<string, unknown> | null {
  const mode = String(row.mode ?? '');
  const next = { ...row };

  if (mode === 'santri') {
    const sid = row.santri_id ? String(row.santri_id) : '';
    if (!sid || !santriIds.has(sid)) return null;
    next.kamar_id = null;
    return next;
  }

  if (mode === 'kamar') {
    const kid = row.kamar_id ? String(row.kamar_id) : '';
    if (!kid || !kamarIds.has(kid)) return null;
    next.santri_id = null;
    return next;
  }

  return next;
}

/** Utamakan id dari nama kamar; abaikan kamar_id usang yang tidak ada di daftar. */
export function coerceKamarForeignKeyId(
  kamarList: { id: string; nama?: string }[],
  kamarNama: string,
  rawKamarId?: string | null
): string | null {
  const trimmed = kamarNama.trim();
  if (trimmed) {
    const byName = kamarList.find((k) => String(k.nama ?? '').trim() === trimmed);
    if (byName) return String(byName.id);
  }
  const kid = rawKamarId ? String(rawKamarId).trim() : '';
  if (kid && kamarList.some((k) => String(k.id) === kid)) return kid;
  return null;
}

export function filterSnapshotChildRows<TRiwayat extends { santri_id: string }>(snapshot: {
  santri: { id: string }[];
  kamar: { id: string }[];
  absensi: Record<string, unknown>[];
  izin: Record<string, unknown>[];
  pembinaan: Record<string, unknown>[];
  riwayat_kamar: TRiwayat[];
}): {
  absensi: Record<string, unknown>[];
  izin: Record<string, unknown>[];
  pembinaan: Record<string, unknown>[];
  riwayat_kamar: TRiwayat[];
} {
  const santriIds = new Set(snapshot.santri.map((s) => String(s.id)));

  const absensi = snapshot.absensi.filter((a) => santriIds.has(String(a.santri_id)));
  const izin = snapshot.izin.filter((i) => santriIds.has(String(i.santri_id)));
  const pembinaan = snapshot.pembinaan.filter((p) => santriIds.has(String(p.santri_id)));
  const riwayat_kamar = snapshot.riwayat_kamar.filter((r) => santriIds.has(String(r.santri_id)));

  return { absensi, izin, pembinaan, riwayat_kamar };
}

export function mapSqliteErrorToUserMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (err instanceof SqlForeignKeyError) return err.message;
  if (/FOREIGN KEY|foreign key constraint failed/i.test(msg)) {
    return (
      'Data tidak konsisten (foreign key). ' +
      'Pastikan santri/kamar/kegiatan masih ada. Muat ulang daftar atau impor ulang cadangan.'
    );
  }
  if (/cannot perform|database is locked/i.test(msg)) {
    return 'Database sedang sibuk. Tunggu sebentar lalu coba lagi.';
  }
  if (/already in transaction|cannot start a transaction/i.test(msg)) {
    return 'Database sedang menyimpan data. Tunggu sebentar lalu coba lagi.';
  }
  if (/UNIQUE constraint failed.*kamar\.nama|kamar\.nama.*UNIQUE/i.test(msg)) {
    return 'Nama kamar sudah dipakai. Gunakan nama lain atau edit kamar yang ada.';
  }
  if (/UNIQUE constraint failed/i.test(msg)) {
    return 'Data sudah ada (nama atau ID duplikat). Periksa daftar atau gunakan nilai lain.';
  }
  return msg || 'Terjadi kesalahan pada database lokal.';
}
