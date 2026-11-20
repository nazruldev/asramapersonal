import type { PenjadwalanEntry } from './penjadwalan';

/** Koleksi yang ikut dibersihkan saat santri dihapus (bukan entitas kamar). */
export type SantriPurgeTarget = {
  santri: Array<{ id?: string; nama?: string; kamar?: string }>;
  absensi: Array<{ santri_id?: string }>;
  izin: Array<{ santri_id?: string }>;
  pembinaan: Array<{ santri_id?: string }>;
  penjadwalan: Array<{ santri_id?: string; mode?: string; kamar_id?: string }>;
  riwayat_kamar: Array<{ santri_id?: string }>;
  kamar: Array<{ nama?: string; ketua?: string }>;
};

function sameSantriId(a: unknown, b: string): boolean {
  return String(a ?? '') === String(b);
}

/** Jadwal hasil generate mode santri (satu baris = satu santri di tanggal tertentu). */
export function penjadwalanBelongsToSantri(
  row: { santri_id?: string; mode?: string },
  santriId: string
): boolean {
  if (row.mode === 'kamar') return false;
  return sameSantriId(row.santri_id, santriId);
}

/**
 * Hapus santri dan semua data yang mengacu santri_id.
 * Kamar tetap ada; hanya ketua yang mengacu nama santri yang dikosongkan.
 */
export function purgeSantriRelatedData(
  db: SantriPurgeTarget,
  santriId: string,
  santriRow?: { nama?: string; kamar?: string } | null
): void {
  const id = String(santriId);
  const row = santriRow ?? db.santri.find((s) => sameSantriId(s.id, id));
  const nama = row?.nama?.trim();
  if (nama) {
    for (const k of db.kamar) {
      const row = k as { ketua?: string; ketua_santri_id?: string };
      if (row.ketua === nama || sameSantriId(row.ketua_santri_id, id)) {
        row.ketua = '';
        delete row.ketua_santri_id;
      }
    }
  }

  db.absensi = db.absensi.filter((a) => !sameSantriId(a.santri_id, id));
  db.izin = db.izin.filter((i) => !sameSantriId(i.santri_id, id));
  db.pembinaan = db.pembinaan.filter((p) => !sameSantriId(p.santri_id, id));
  // Penjadwalan v4: snapshot generate — tidak ikut dihapus saat santri dihapus.
  if (Array.isArray(db.riwayat_kamar)) {
    db.riwayat_kamar = db.riwayat_kamar.filter((r) => !sameSantriId(r.santri_id, id));
  }
  db.santri = db.santri.filter((s) => !sameSantriId(s.id, id));
}

/** Jadwal mode santri yang santri_id-nya sudah tidak ada. */
export function pruneOrphanPenjadwalan(
  entries: PenjadwalanEntry[],
  santriIds: Set<string>,
  kamarIds: Set<string>
): PenjadwalanEntry[] {
  return entries.filter((p) => {
    if (p.mode === 'santri') {
      const sid = p.santri_id ? String(p.santri_id) : '';
      return Boolean(sid && santriIds.has(sid));
    }
    if (p.mode === 'kamar' && p.kamar_id) {
      return kamarIds.has(String(p.kamar_id));
    }
    return true;
  });
}

/** Saat generate tanpa ganti jadwal lama: jangan duplikasi tanggal+mode per jenis. */
export function filterPenjadwalanWithoutReplacing(
  existing: PenjadwalanEntry[],
  incoming: PenjadwalanEntry[],
  jenis: string
): PenjadwalanEntry[] {
  const taken = new Set(
    existing
      .filter((p) => p.jenis === jenis)
      .map((p) => `${String(p.tanggal)}|${p.mode}`)
  );
  return incoming.filter((e) => !taken.has(`${e.tanggal}|${e.mode}`));
}
