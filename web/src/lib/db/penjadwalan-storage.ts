import type { PenjadwalanEntry, PenjadwalanMode } from '../penjadwalan';
import { normalizeDateKey } from './date-normalize';

type SantriRef = { id: string; nama?: string; kamar?: string };
type KamarRef = { id: string; nama?: string; ketua?: string };

export function penjadwalanRowToEntry(row: Record<string, unknown>): PenjadwalanEntry {
  const mode = row.mode as PenjadwalanMode;
  const assigneeSantri = row.assignee_santri_id
    ? String(row.assignee_santri_id)
    : row.santri_id
      ? String(row.santri_id)
      : undefined;
  const assigneeKamar = row.assignee_kamar_id
    ? String(row.assignee_kamar_id)
    : row.kamar_id
      ? String(row.kamar_id)
      : undefined;
  return {
    id: String(row.id),
    jenis: String(row.jenis),
    tanggal: normalizeDateKey(row.tanggal),
    mode,
    assignee_santri_id: assigneeSantri,
    assignee_kamar_id: assigneeKamar,
    assignee_nama: String(row.assignee_nama ?? '-'),
    assignee_detail: row.assignee_detail ? String(row.assignee_detail) : undefined,
    catatan: row.catatan ? String(row.catatan) : undefined,
    generated_at: row.generated_at ? String(row.generated_at) : undefined,
    generate_batch_id: row.generate_batch_id ? String(row.generate_batch_id) : undefined,
    santri_id: assigneeSantri,
    kamar_id: assigneeKamar,
  };
}

export function snapshotPenjadwalanEntry(
  entry: Omit<PenjadwalanEntry, 'assignee_nama' | 'generated_at'> & {
    assignee_nama?: string;
    generated_at?: string;
  },
  santriList: SantriRef[],
  kamarList: KamarRef[],
  generatedAt: string,
  batchId?: string
): PenjadwalanEntry {
  const tanggal = normalizeDateKey(entry.tanggal);
  if (entry.mode === 'santri') {
    const sid = entry.assignee_santri_id ?? entry.santri_id;
    const santri = sid ? santriList.find((s) => String(s.id) === String(sid)) : undefined;
    const nama = entry.assignee_nama ?? santri?.nama ?? 'Santri?';
    const detail = entry.assignee_detail ?? (santri?.kamar ? String(santri.kamar) : undefined);
    return {
      id: entry.id,
      jenis: entry.jenis,
      tanggal,
      mode: 'santri',
      assignee_santri_id: sid ? String(sid) : undefined,
      assignee_kamar_id: undefined,
      assignee_nama: String(nama),
      assignee_detail: detail,
      catatan: entry.catatan,
      generated_at: generatedAt,
      generate_batch_id: batchId,
      santri_id: sid ? String(sid) : undefined,
      kamar_id: undefined,
    };
  }
  const kid = entry.assignee_kamar_id ?? entry.kamar_id;
  const kamar = kid ? kamarList.find((k) => String(k.id) === String(kid)) : undefined;
  const nama = entry.assignee_nama ?? kamar?.nama ?? 'Kamar?';
  const ketua = kamar?.ketua ? String(kamar.ketua) : '';
  const detail = entry.assignee_detail ?? (ketua ? `Ketua: ${ketua}` : undefined);
  return {
    id: entry.id,
    jenis: entry.jenis,
    tanggal,
    mode: 'kamar',
    assignee_santri_id: undefined,
    assignee_kamar_id: kid ? String(kid) : undefined,
    assignee_nama: String(nama),
    assignee_detail: detail,
    catatan: entry.catatan,
    generated_at: generatedAt,
    generate_batch_id: batchId,
    santri_id: undefined,
    kamar_id: kid ? String(kid) : undefined,
  };
}

export function penjadwalanInsertParams(row: PenjadwalanEntry): (string | null)[] {
  return [
    row.id,
    row.jenis,
    normalizeDateKey(row.tanggal),
    row.mode,
    row.assignee_santri_id ?? row.santri_id ?? null,
    row.assignee_kamar_id ?? row.kamar_id ?? null,
    row.assignee_nama,
    row.assignee_detail ?? null,
    row.catatan ?? null,
    row.generated_at ?? new Date().toISOString(),
    row.generate_batch_id ?? null,
  ];
}
