export function toggleMultiSelect(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function kelasOptionsFromSantri(
  santriList: { kelas?: string }[]
): string[] {
  const set = new Set(
    santriList
      .map((s) => s.kelas)
      .filter((k): k is string => Boolean(k && k.trim()))
  );
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
}

export function kamarOptionsFromSantri(
  santriList: { kamar?: string }[],
  extraKamar?: Iterable<string>
): string[] {
  const set = new Set(
    santriList
      .map((s) => s.kamar)
      .filter((k): k is string => Boolean(k && k.trim()))
  );
  if (extraKamar) {
    for (const k of extraKamar) {
      if (k && k.trim() && k !== '-') set.add(k);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
}

export function matchesSantriSearchAndRoomFilters(
  meta: { nama: string; kelas: string; kamar: string },
  searchQuery: string,
  selectedKelas: string[],
  selectedKamar: string[]
): boolean {
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    const match =
      meta.nama.toLowerCase().includes(q) ||
      meta.kelas.toLowerCase().includes(q) ||
      meta.kamar.toLowerCase().includes(q);
    if (!match) return false;
  }
  if (selectedKelas.length > 0 && !selectedKelas.includes(meta.kelas)) return false;
  if (selectedKamar.length > 0 && !selectedKamar.includes(meta.kamar)) return false;
  return true;
}
