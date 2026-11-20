import { formatLamaDiKamar, kamarDetailPath } from '@/lib/kamar-path';
import { coerceKamarForeignKeyId } from '@/lib/sqlite-fk';

export type SantriKamarRiwayatTipe = 'masuk' | 'pindah' | 'keluar' | 'ketua';

export type SantriKamarRiwayatRow = {
  id: string;
  santri_id: string;
  kamar_id?: string;
  kamar_nama: string;
  tipe: SantriKamarRiwayatTipe;
  tanggal: string;
  kamar_sebelumnya?: string;
  kamar_sebelumnya_id?: string;
  kamar_sebelumnya_nama?: string;
};

export type SantriKamarRiwayatSummary = {
  pindahKamar: number;
  sebagaiKetua: number;
  sebagaiAnggota: number;
};

/** Kolom riwayat kamar v4 (id + nama); legacy hanya punya `kamar_sebelumnya` teks. */
export function resolveRiwayatKamarSebelumnyaFields(
  row: Pick<
    SantriKamarRiwayatRow,
    'kamar_sebelumnya' | 'kamar_sebelumnya_id' | 'kamar_sebelumnya_nama'
  >,
  kamarList: { id: string; nama?: string }[]
): { prevId: string | null; prevNama: string | null; prevLegacy: string | null } {
  const prevId =
    row.kamar_sebelumnya_id ??
    (row.kamar_sebelumnya
      ? coerceKamarForeignKeyId(kamarList, row.kamar_sebelumnya, undefined)
      : null);
  const prevNama = row.kamar_sebelumnya_nama ?? row.kamar_sebelumnya ?? null;
  const prevLegacy = row.kamar_sebelumnya ?? prevNama;
  return { prevId, prevNama, prevLegacy };
}

export function santriKamarRiwayatPath(santriId: string): string {
  return `/master/santri/${encodeURIComponent(santriId)}/kamar`;
}

export function parseSantriIdFromKamarRiwayatPath(pathname: string): string | null {
  const match = pathname.match(/^\/master\/santri\/([^/]+)\/kamar$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function summarizeSantriKamarRiwayat(rows: SantriKamarRiwayatRow[]): SantriKamarRiwayatSummary {
  let pindahKamar = 0;
  let sebagaiKetua = 0;
  let sebagaiAnggota = 0;
  for (const row of rows) {
    if (row.tipe === 'pindah') {
      pindahKamar += 1;
      sebagaiAnggota += 1;
    } else if (row.tipe === 'masuk') {
      sebagaiAnggota += 1;
    } else if (row.tipe === 'ketua') {
      sebagaiKetua += 1;
    }
  }
  return { pindahKamar, sebagaiKetua, sebagaiAnggota };
}

export function labelRiwayatKamarTipe(tipe: SantriKamarRiwayatTipe): string {
  switch (tipe) {
    case 'masuk':
      return 'Masuk kamar';
    case 'pindah':
      return 'Pindah kamar';
    case 'keluar':
      return 'Keluar kamar';
    case 'ketua':
      return 'Menjadi ketua';
    default:
      return tipe;
  }
}

export function formatRiwayatKamarTanggal(tanggal: string): string {
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function recordSantriKamarRiwayat(
  list: SantriKamarRiwayatRow[],
  createId: () => string,
  entry: Omit<SantriKamarRiwayatRow, 'id' | 'tanggal'> & { tanggal?: string }
) {
  list.push({
    ...entry,
    id: createId(),
    tanggal: entry.tanggal ?? new Date().toISOString(),
  });
}

export function logSantriKamarAssignmentChange(
  list: SantriKamarRiwayatRow[],
  createId: () => string,
  santriId: string,
  prevKamar: string,
  nextKamar: string,
  resolveKamarId: (nama: string) => string | undefined
) {
  if (!prevKamar && !nextKamar) return;
  if (prevKamar === nextKamar) return;

  if (!nextKamar && prevKamar) {
    recordSantriKamarRiwayat(list, createId, {
      santri_id: santriId,
      kamar_nama: prevKamar,
      kamar_id: resolveKamarId(prevKamar),
      tipe: 'keluar',
    });
    return;
  }

  if (prevKamar && nextKamar) {
    recordSantriKamarRiwayat(list, createId, {
      santri_id: santriId,
      kamar_nama: nextKamar,
      kamar_id: resolveKamarId(nextKamar),
      kamar_sebelumnya: prevKamar,
      tipe: 'pindah',
    });
    return;
  }

  if (nextKamar) {
    recordSantriKamarRiwayat(list, createId, {
      santri_id: santriId,
      kamar_nama: nextKamar,
      kamar_id: resolveKamarId(nextKamar),
      tipe: 'masuk',
    });
  }
}

export function formatLamaDiKamarSantri(masukSejak?: string): string {
  return formatLamaDiKamar(masukSejak);
}

export type SantriKamarCurrentInfo = {
  kamarId: string;
  nama: string;
  kapasitas: number;
  terisi: number;
  ketuaNama: string;
  isKetua: boolean;
  masukSejak?: string;
  lamaDiKamar: string;
  detailPath: string;
};

export type SantriKamarRiwayatApiResponse = {
  santri: { id: string; nama: string; kelas: string };
  summary: SantriKamarRiwayatSummary;
  timeline: SantriKamarRiwayatRow[];
  currentKamar: SantriKamarCurrentInfo | null;
};

type SantriKamarDbSlice = {
  santri: Array<{
    id: string;
    nama?: string;
    kelas?: string;
    kamar?: string;
    masuk_kamar_sejak?: string;
  }>;
  kamar: Array<{ id: string; nama: string; kapasitas?: number; ketua?: string }>;
  riwayat_kamar: SantriKamarRiwayatRow[];
};

export function buildSantriKamarRiwayatResponse(
  santriId: string,
  slice: SantriKamarDbSlice
): SantriKamarRiwayatApiResponse | null {
  const santri = slice.santri.find((s) => s.id === santriId);
  if (!santri) return null;

  const rows = slice.riwayat_kamar
    .filter((r) => r.santri_id === santriId)
    .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

  const summary = summarizeSantriKamarRiwayat(rows);
  const kamarNama = typeof santri.kamar === 'string' ? santri.kamar.trim() : '';

  let currentKamar: SantriKamarCurrentInfo | null = null;
  if (kamarNama) {
    const kamar = slice.kamar.find((k) => k.nama === kamarNama);
    if (kamar) {
      const terisi = slice.santri.filter((s) => (s.kamar ?? '').trim() === kamarNama).length;
      const ketuaNama = String(kamar.ketua ?? '');
      currentKamar = {
        kamarId: kamar.id,
        nama: kamar.nama,
        kapasitas: Number(kamar.kapasitas) || 4,
        terisi,
        ketuaNama,
        isKetua: ketuaNama === santri.nama,
        masukSejak: santri.masuk_kamar_sejak,
        lamaDiKamar: formatLamaDiKamar(santri.masuk_kamar_sejak),
        detailPath: kamarDetailPath(kamar.id),
      };
    }
  }

  return {
    santri: {
      id: santriId,
      nama: String(santri.nama ?? ''),
      kelas: String(santri.kelas ?? '-'),
    },
    summary,
    timeline: rows,
    currentKamar,
  };
}
