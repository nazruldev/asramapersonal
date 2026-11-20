import { buildDefaultKelasRecords } from '../kelas-defaults';

export function resolveKelasId(
  kelasList: { id: string; nama: string; tingkat?: string }[],
  raw: unknown
): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const byId = kelasList.find((k) => String(k.id) === text);
  if (byId) return String(byId.id);
  const byName = kelasList.find((k) => String(k.nama ?? '').trim() === text);
  return byName ? String(byName.id) : null;
}

export function kelasNamaById(
  kelasList: { id: string; nama: string }[],
  kelasId: string | null | undefined
): string {
  if (!kelasId) return '';
  const hit = kelasList.find((k) => String(k.id) === String(kelasId));
  return hit ? String(hit.nama) : '';
}

/** Pastikan daftar kelas tidak kosong; kembalikan id fallback untuk santri tanpa kelas. */
export function ensureKelasListForMigration(
  kelas: { id: string; nama: string; tingkat?: string }[],
  newId: () => string
): { kelas: { id: string; nama: string; tingkat: string }[]; fallbackKelasId: string } {
  const list =
    kelas.length > 0
      ? kelas.map((k) => ({
          id: String(k.id),
          nama: String(k.nama),
          tingkat: String(k.tingkat ?? 'MTS'),
        }))
      : buildDefaultKelasRecords(newId, { stableIds: true });
  return { kelas: list, fallbackKelasId: String(list[0]?.id ?? '') };
}
