export type PenjadwalanJenis = 'adzan' | 'pembersihan' | (string & {});
export type PenjadwalanMode = 'santri' | 'kamar';

export type PenjadwalanEntry = {
  id: string;
  jenis: PenjadwalanJenis;
  tanggal: string;
  mode: PenjadwalanMode;
  /** Snapshot saat generate (v4) */
  assignee_santri_id?: string;
  assignee_kamar_id?: string;
  assignee_nama: string;
  assignee_detail?: string;
  generated_at?: string;
  generate_batch_id?: string;
  catatan?: string;
  /** Alias kompatibel UI/API lama */
  santri_id?: string;
  kamar_id?: string;
};

export type PenjadwalanGenerateInput = {
  jenis: PenjadwalanJenis;
  mode: PenjadwalanMode;
  mulai: string;
  bulanKeDepan: number;
  gantiYangAda?: boolean;
};

/** Pengaturan generate terakhir per jenis — dipakai untuk generate ulang. */
export type PenjadwalanPreset = {
  id: string;
  jenis: PenjadwalanJenis;
  mode: PenjadwalanMode;
  mulai: string;
  bulanKeDepan: number;
  gantiYangAda: boolean;
  updatedAt: string;
};

export function penjadwalanJenisPath(jenis: string): string {
  return `/penjadwalan/jenis/${encodeURIComponent(jenis)}`;
}

export function parsePenjadwalanJenisFromPath(pathname: string): string | null {
  const prefix = '/penjadwalan/jenis/';
  if (!pathname.startsWith(prefix)) return null;
  const raw = pathname.slice(prefix.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function guessBulanKeDepanFromRange(dari: string, sampai: string): number {
  for (let m = 1; m <= 24; m++) {
    const { sampai: end } = dateRangeForMonths(dari, m);
    if (end >= sampai) return m;
  }
  return 24;
}

export function derivePresetsFromEntries(
  entries: PenjadwalanEntry[],
  newId: () => string
): PenjadwalanPreset[] {
  const byJenis = new Map<string, PenjadwalanEntry[]>();
  for (const e of entries) {
    const key = String(e.jenis);
    const list = byJenis.get(key) ?? [];
    list.push(e);
    byJenis.set(key, list);
  }
  const presets: PenjadwalanPreset[] = [];
  for (const [jenis, rows] of byJenis) {
    const dates = rows.map((r) => r.tanggal).sort();
    const dari = dates[0];
    const sampai = dates[dates.length - 1];
    const modeCounts = { santri: 0, kamar: 0 };
    for (const r of rows) {
      if (r.mode === 'kamar') modeCounts.kamar++;
      else modeCounts.santri++;
    }
    const mode: PenjadwalanMode = modeCounts.kamar >= modeCounts.santri ? 'kamar' : 'santri';
    presets.push({
      id: newId(),
      jenis,
      mode,
      mulai: dari,
      bulanKeDepan: guessBulanKeDepanFromRange(dari, sampai),
      gantiYangAda: true,
      updatedAt: new Date().toISOString(),
    });
  }
  return presets;
}

export function upsertPenjadwalanPreset(
  presets: PenjadwalanPreset[],
  input: PenjadwalanGenerateInput,
  newId: () => string
): PenjadwalanPreset[] {
  const next = [...presets];
  const idx = next.findIndex((p) => p.jenis === input.jenis);
  const preset: PenjadwalanPreset = {
    id: idx >= 0 ? next[idx].id : newId(),
    jenis: input.jenis,
    mode: input.mode,
    mulai: input.mulai.slice(0, 10),
    bulanKeDepan: clampBulanKeDepan(input.bulanKeDepan),
    gantiYangAda: true,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) next[idx] = preset;
  else next.push(preset);
  return next;
}

export function syncPenjadwalanPresets(
  entries: PenjadwalanEntry[],
  presets: PenjadwalanPreset[],
  newId: () => string
): PenjadwalanPreset[] {
  const existing = [...presets];
  const jenisWithPreset = new Set(existing.map((p) => String(p.jenis)));
  const jenisInEntries = [...new Set(entries.map((e) => String(e.jenis)))];
  const toDerive = jenisInEntries.filter((j) => !jenisWithPreset.has(j));
  if (toDerive.length === 0) return existing;
  const subset = entries.filter((e) => toDerive.includes(String(e.jenis)));
  const derived = derivePresetsFromEntries(subset, newId);
  for (const d of derived) {
    if (!existing.some((p) => p.jenis === d.jenis)) existing.push(d);
  }
  return existing;
}

type SantriRef = { id: string; nama?: string; kamar?: string };
type KamarRef = { id: string; nama?: string };

export const JENIS_PENJADWALAN_BAWAAN: { id: PenjadwalanJenis; label: string }[] = [
  { id: 'adzan', label: 'Petugas Adzan' },
  { id: 'pembersihan', label: 'Kebersihan Asrama' },
];

export function clampBulanKeDepan(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(24, Math.max(1, Math.round(value)));
}

export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addMonths(date: Date, months: number): Date {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + months, day);
  if (next.getDate() !== day) {
    return new Date(date.getFullYear(), date.getMonth() + months + 1, 0);
  }
  return next;
}

/** Hari inklusif dari mulai sampai akhir periode (mulai + N bulan). */
export function dateRangeForMonths(mulai: string, bulanKeDepan: number): { dari: string; sampai: string } {
  const start = parseDateOnly(mulai);
  const end = addMonths(start, clampBulanKeDepan(bulanKeDepan));
  const endInclusive = new Date(end);
  endInclusive.setDate(endInclusive.getDate() - 1);
  return { dari: formatDateOnly(start), sampai: formatDateOnly(endInclusive) };
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setDate(d.getDate() + days);
  return formatDateOnly(d);
}

export function todayDateOnlyIso(): string {
  return formatDateOnly(new Date());
}

export type PenjadwalanVitalitas = 'aktif' | 'kadaluarsa' | 'kosong';

/** Status jadwal berdasarkan tanggal terakhir vs hari ini. */
export function penjadwalanVitalitas(
  entries: PenjadwalanEntry[],
  jenis: string,
  hariIni = todayDateOnlyIso()
): PenjadwalanVitalitas {
  const terakhir = lastTanggalForJenis(entries, jenis);
  if (!terakhir) return 'kosong';
  if (terakhir < hariIni) return 'kadaluarsa';
  return 'aktif';
}

/** Tanggal terakhir yang punya jadwal untuk jenis ini (YYYY-MM-DD), atau null. */
export function lastTanggalForJenis(entries: PenjadwalanEntry[], jenis: string): string | null {
  const dates = entries
    .filter((e) => String(e.jenis) === jenis)
    .map((e) => String(e.tanggal).slice(0, 10))
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** Cara generate — supaya tidak bingung antara "ulang" vs "tambah ke depan". */
export type PenjadwalanTujuan = 'buat-ulang' | 'lanjutkan' | 'manual';

export function resolveGenerateFromTujuan(
  tujuan: PenjadwalanTujuan,
  jenis: string,
  entries: PenjadwalanEntry[],
  preset: Pick<PenjadwalanPreset, 'mulai' | 'bulanKeDepan'> | null,
  manual: { mulai: string; bulanKeDepan: number; gantiYangAda: boolean }
): { mulai: string; bulanKeDepan: number; gantiYangAda: boolean } {
  const bulan = clampBulanKeDepan(manual.bulanKeDepan);
  if (tujuan === 'buat-ulang' && preset) {
    return {
      mulai: preset.mulai.slice(0, 10),
      bulanKeDepan: preset.bulanKeDepan,
      gantiYangAda: true,
    };
  }
  if (tujuan === 'lanjutkan') {
    const terakhir = lastTanggalForJenis(entries, jenis);
    const mulai = terakhir ? addDaysIso(terakhir, 1) : manual.mulai.slice(0, 10);
    return {
      mulai,
      bulanKeDepan: preset?.bulanKeDepan ?? bulan,
      gantiYangAda: false,
    };
  }
  return {
    mulai: manual.mulai.slice(0, 10),
    bulanKeDepan: bulan,
    gantiYangAda: manual.gantiYangAda,
  };
}

export function buildGenerateRequestBody(
  jenis: string,
  mode: PenjadwalanMode,
  tujuan: PenjadwalanTujuan,
  entries: PenjadwalanEntry[],
  preset: PenjadwalanPreset | null,
  manual: { mulai: string; bulanKeDepan: number; gantiYangAda: boolean }
): PenjadwalanGenerateInput {
  const resolved = resolveGenerateFromTujuan(tujuan, jenis, entries, preset, manual);
  return {
    jenis,
    mode,
    mulai: resolved.mulai,
    bulanKeDepan: clampBulanKeDepan(resolved.bulanKeDepan),
    gantiYangAda: resolved.gantiYangAda,
  };
}

export function parsePenjadwalanTujuanFromSearch(aksi: string | null): PenjadwalanTujuan | null {
  if (aksi === 'buat-ulang' || aksi === 'lanjutkan' || aksi === 'manual') return aksi;
  return null;
}

export function eachDayInclusive(dari: string, sampai: string): string[] {
  const days: string[] = [];
  let cur = parseDateOnly(dari);
  const last = parseDateOnly(sampai);
  while (cur.getTime() <= last.getTime()) {
    days.push(formatDateOnly(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return days;
}

export function sortSantriForRotation(list: SantriRef[]): SantriRef[] {
  return [...list].sort((a, b) => String(a.nama ?? '').localeCompare(String(b.nama ?? ''), 'id'));
}

export function sortKamarForRotation(list: KamarRef[]): KamarRef[] {
  return [...list].sort((a, b) => String(a.nama ?? '').localeCompare(String(b.nama ?? ''), 'id'));
}

export function buildGeneratedEntries(
  input: PenjadwalanGenerateInput,
  santriList: SantriRef[],
  kamarList: KamarRef[],
  newId: () => string,
  opts?: { generatedAt?: string; batchId?: string }
): PenjadwalanEntry[] {
  const generatedAt = opts?.generatedAt ?? new Date().toISOString();
  const batchId = opts?.batchId;
  const bulan = clampBulanKeDepan(input.bulanKeDepan);
  const { dari, sampai } = dateRangeForMonths(input.mulai, bulan);
  const days = eachDayInclusive(dari, sampai);

  const poolSantri = sortSantriForRotation(santriList);
  const poolKamar = sortKamarForRotation(kamarList);

  if (input.mode === 'santri' && poolSantri.length === 0) return [];
  if (input.mode === 'kamar' && poolKamar.length === 0) return [];

  const entries: PenjadwalanEntry[] = [];
  for (let i = 0; i < days.length; i++) {
    const tanggal = days[i];
    if (input.mode === 'santri') {
      const s = poolSantri[i % poolSantri.length];
      entries.push({
        id: newId(),
        jenis: input.jenis,
        tanggal,
        mode: 'santri',
        assignee_santri_id: s.id,
        assignee_nama: String(s.nama ?? 'Santri?'),
        assignee_detail: s.kamar ? String(s.kamar) : undefined,
        generated_at: generatedAt,
        generate_batch_id: batchId,
        santri_id: s.id,
      });
    } else {
      const k = poolKamar[i % poolKamar.length];
      entries.push({
        id: newId(),
        jenis: input.jenis,
        tanggal,
        mode: 'kamar',
        assignee_kamar_id: k.id,
        assignee_nama: String(k.nama ?? 'Kamar?'),
        generated_at: generatedAt,
        generate_batch_id: batchId,
        kamar_id: k.id,
      });
    }
  }
  return entries;
}

export function jenisLabel(jenis: PenjadwalanJenis): string {
  const found = JENIS_PENJADWALAN_BAWAAN.find((j) => j.id === jenis);
  return found?.label ?? jenis;
}
