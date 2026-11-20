export type KelasRecord = {
  id: string;
  nama: string;
  tingkat: string;
};

type DefaultKelasSeed = Omit<KelasRecord, 'id'>;

/** Template data awal kelas madrasah (satu sumber untuk client & server). */
export const DEFAULT_KELAS_SEED: DefaultKelasSeed[] = [
  { nama: '7', tingkat: 'MTS' },
  { nama: '8', tingkat: 'MTS' },
  { nama: '9', tingkat: 'MTS' },
  { nama: '10', tingkat: 'ALIYAH' },
  { nama: '11', tingkat: 'ALIYAH' },
  { nama: '12', tingkat: 'ALIYAH' },
];

const DEFAULT_KELAS_STABLE_IDS = [
  'seed-kelas-mts-7',
  'seed-kelas-mts-8',
  'seed-kelas-mts-9',
  'seed-kelas-aliyah-10',
  'seed-kelas-aliyah-11',
  'seed-kelas-aliyah-12',
];

export function buildDefaultKelasRecords(
  createId: () => string,
  options?: { stableIds?: boolean }
): KelasRecord[] {
  return DEFAULT_KELAS_SEED.map((seed, index) => ({
    id:
      options?.stableIds && index < DEFAULT_KELAS_STABLE_IDS.length
        ? DEFAULT_KELAS_STABLE_IDS[index]
        : createId(),
    ...seed,
  }));
}
