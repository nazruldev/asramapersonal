export type SantriKamarResident = {
  id: string;
  nama?: string;
  kamar?: string;
  masuk_kamar_sejak?: string;
};

export type KamarKetuaRef = {
  nama: string;
  ketua?: string;
};

const normKamar = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function isSantriKetuaOfKamar(
  santri: { nama?: string; kamar?: string },
  kamarList: KamarKetuaRef[]
): boolean {
  const kamarNama = normKamar(santri.kamar);
  const nama = santri.nama?.trim();
  if (!kamarNama || !nama) return false;
  const room = kamarList.find((k) => k.nama === kamarNama);
  return room?.ketua === nama;
}

/** Penghuni dengan masuk_kamar_sejak paling lama (tanpa tanggal di urutan terakhir). */
export function pickSantriLongestInKamar(
  santriList: SantriKamarResident[],
  kamarNama: string,
  excludeId?: string
): { id: string; nama: string } | null {
  const target = normKamar(kamarNama);
  if (!target) return null;

  const inRoom = santriList.filter(
    (s) => s.id !== excludeId && normKamar(s.kamar) === target && s.nama?.trim()
  );
  if (inRoom.length === 0) return null;

  const sorted = [...inRoom].sort((a, b) => {
    const ta = a.masuk_kamar_sejak ? new Date(a.masuk_kamar_sejak).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.masuk_kamar_sejak ? new Date(b.masuk_kamar_sejak).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  const pick = sorted[0];
  return pick?.nama ? { id: pick.id, nama: pick.nama.trim() } : null;
}
