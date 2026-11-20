import type { OfflineDbSnapshot } from './snapshot-types';
import type { PenjadwalanPreset } from '../penjadwalan';
import type { SantriKamarRiwayatRow } from '../santri-kamar-riwayat';
import { v4 as uuidv4 } from 'uuid';
import { normalizeDateKey } from './date-normalize';
import { ensureKelasListForMigration, resolveKelasId } from './kelas-resolve';
import { penjadwalanRowToEntry, snapshotPenjadwalanEntry } from './penjadwalan-storage';

const newId = () => uuidv4();

function resolveKamarIdByName(
  kamar: { id: string; nama?: string }[],
  nama: string
): string | null {
  const t = nama.trim();
  if (!t) return null;
  const hit = kamar.find((k) => String(k.nama ?? '').trim() === t);
  return hit ? String(hit.id) : null;
}

function migratePenjadwalanRows(
  rows: Record<string, unknown>[],
  santri: Record<string, unknown>[],
  kamar: Record<string, unknown>[]
): Record<string, unknown>[] {
  const santriRefs = santri.map((s) => ({
    id: String(s.id),
    nama: String(s.nama ?? ''),
    kamar: String(s.kamar ?? ''),
  }));
  const kamarRefs = kamar.map((k) => ({
    id: String(k.id),
    nama: String(k.nama ?? ''),
    ketua: k.ketua ? String(k.ketua) : undefined,
  }));
  const now = new Date().toISOString();
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const raw of rows) {
    const base = penjadwalanRowToEntry(raw);
    const snap = snapshotPenjadwalanEntry(base, santriRefs, kamarRefs, raw.generated_at ? String(raw.generated_at) : now);
    const slot = `${snap.jenis}|${snap.tanggal}|${snap.mode}`;
    if (seen.has(slot)) continue;
    seen.add(slot);
    out.push({ ...snap });
  }
  return out;
}

function migrateKamarRows(
  kamar: Record<string, unknown>[],
  santri: Record<string, unknown>[]
): Record<string, unknown>[] {
  return kamar.map((k) => {
    const ketuaName = k.ketua ? String(k.ketua).trim() : '';
    let ketua_santri_id: string | undefined;
    if (ketuaName) {
      const hit = santri.find(
        (s) => String(s.nama ?? '').trim() === ketuaName && String(s.kamar ?? '').trim() === String(k.nama ?? '').trim()
      );
      if (hit) ketua_santri_id = String(hit.id);
    }
    if (k.ketua_santri_id) ketua_santri_id = String(k.ketua_santri_id);
    const { ketua: _k, ...rest } = k;
    return { ...rest, ketua_santri_id, ketua: ketuaName || undefined };
  });
}

function migrateSantriRows(
  santri: Record<string, unknown>[],
  kelasList: { id: string; nama: string; tingkat?: string }[],
  fallbackKelasId: string
): Record<string, unknown>[] {
  const now = new Date().toISOString();
  return santri.map((s) => {
    const kelas_id =
      resolveKelasId(kelasList, s.kelas_id) ??
      resolveKelasId(kelasList, s.kelas) ??
      fallbackKelasId;
    const kelasNama =
      kelasList.find((k) => String(k.id) === kelas_id)?.nama ?? String(s.kelas ?? '');
    return {
      ...s,
      kelas_id,
      kelas: kelasNama,
      created_at: s.created_at ?? now,
      updated_at: s.updated_at ?? now,
    };
  });
}

function migrateAbsensiRows(
  rows: Record<string, unknown>[],
  kegiatan: Record<string, unknown>[]
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const label = String(row.kegiatan ?? row.kegiatan_label ?? '').trim();
    let kegiatan_id = row.kegiatan_id ? String(row.kegiatan_id) : '';
    if (!kegiatan_id && label) {
      const hit = kegiatan.find((k) => String(k.nama ?? '') === label);
      if (hit) kegiatan_id = String(hit.id);
    }
    if (!kegiatan_id) continue;
    const tanggal = normalizeDateKey(row.tanggal);
    const sid = String(row.santri_id ?? '');
    const key = `${sid}|${kegiatan_id}|${tanggal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...row,
      kegiatan_id,
      kegiatan: label || kegiatan.find((k) => String(k.id) === kegiatan_id)?.nama,
      tanggal,
    });
  }
  return out;
}

function migrateRiwayatRows(
  rows: SantriKamarRiwayatRow[],
  kamar: { id: string; nama?: string }[]
): SantriKamarRiwayatRow[] {
  return rows.map((r) => {
    const prevName = r.kamar_sebelumnya?.trim() ?? '';
    const prevId = prevName ? resolveKamarIdByName(kamar, prevName) : undefined;
    return {
      ...r,
      kamar_sebelumnya_id: prevId ?? undefined,
      kamar_sebelumnya_nama: prevName || undefined,
      kamar_sebelumnya: prevName || undefined,
    };
  });
}

function migratePresets(presets: PenjadwalanPreset[]): PenjadwalanPreset[] {
  return presets.map((p) => ({
    ...p,
    gantiYangAda: p.gantiYangAda === true,
    mulai: p.mulai?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  }));
}

export function transformOfflineSnapshotToV4(snapshot: OfflineDbSnapshot): OfflineDbSnapshot {
  const { kelas: kelasEnsured, fallbackKelasId } = ensureKelasListForMigration(
    snapshot.kelas as { id: string; nama: string; tingkat?: string }[],
    newId
  );
  let santri = migrateSantriRows(snapshot.santri, kelasEnsured, fallbackKelasId);
  let kamar = migrateKamarRows(snapshot.kamar, santri);
  santri = migrateSantriRows(santri, kelasEnsured, fallbackKelasId);
  const penjadwalan = migratePenjadwalanRows(snapshot.penjadwalan, santri, kamar);
  const absensi = migrateAbsensiRows(snapshot.absensi, snapshot.kegiatan);
  const riwayat_kamar = migrateRiwayatRows(snapshot.riwayat_kamar, kamar as { id: string; nama?: string }[]);

  return {
    ...snapshot,
    kelas: kelasEnsured,
    kamar,
    santri,
    penjadwalan,
    penjadwalanPreset: migratePresets(snapshot.penjadwalanPreset),
    absensi,
    riwayat_kamar,
  };
}
