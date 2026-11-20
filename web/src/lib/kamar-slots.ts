export type KamarSlotRow = {
  id: string;
  nama: string;
  lantai?: string;
  ketua?: string;
  kapasitas: number;
  terisi: number;
  kosong: number;
  isFull: boolean;
};

export type KamarSlotTotals = {
  jumlahKamar: number;
  kapasitas: number;
  terisi: number;
  kosong: number;
};

type KamarInput = {
  id: string;
  nama: string;
  kapasitas?: number;
  terisi?: number;
  lantai?: string;
  ketua?: string;
};

export function buildKamarSlotRows(kamarList: KamarInput[]): KamarSlotRow[] {
  return kamarList
    .map((k) => {
      const kapasitas = Math.max(0, Number(k.kapasitas) || 4);
      const terisi = Math.max(0, Math.min(kapasitas, Number(k.terisi) ?? 0));
      const kosong = Math.max(0, kapasitas - terisi);
      return {
        id: k.id,
        nama: k.nama,
        lantai: k.lantai,
        ketua: k.ketua,
        kapasitas,
        terisi,
        kosong,
        isFull: terisi >= kapasitas,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

export function sumKamarSlotTotals(rows: KamarSlotRow[]): KamarSlotTotals {
  return rows.reduce(
    (acc, r) => ({
      jumlahKamar: acc.jumlahKamar + 1,
      kapasitas: acc.kapasitas + r.kapasitas,
      terisi: acc.terisi + r.terisi,
      kosong: acc.kosong + r.kosong,
    }),
    { jumlahKamar: 0, kapasitas: 0, terisi: 0, kosong: 0 }
  );
}

/** Indeks slot terisi (0..terisi-1) dan kosong untuk UI grid. */
export function kamarSlotStates(terisi: number, kapasitas: number): ('filled' | 'empty')[] {
  const cap = Math.max(0, kapasitas);
  const filled = Math.max(0, Math.min(cap, terisi));
  return Array.from({ length: cap }, (_, i) => (i < filled ? 'filled' : 'empty'));
}
