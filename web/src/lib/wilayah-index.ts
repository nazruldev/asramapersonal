import type { WilayahIndex, WilayahListItem } from '@/lib/wilayah-types';

let cached: WilayahIndex | null = null;

export async function loadWilayahIndex(): Promise<WilayahIndex> {
  if (cached) return cached;
  const res = await fetch('./data/wilayah-index.json');
  if (!res.ok) {
    throw new Error('Indeks wilayah tidak ditemukan. Jalankan npm run data:wilayah.');
  }
  cached = (await res.json()) as WilayahIndex;
  return cached;
}

/** Sinkron — hanya setelah loadWilayahIndex() atau setWilayahIndexCache() */
export function getWilayahIndexSync(): WilayahIndex | null {
  return cached;
}

export function setWilayahIndexCache(index: WilayahIndex) {
  cached = index;
}

function normQ(q: string | undefined) {
  return (q ?? '').trim().toLowerCase();
}

function matchName(name: string, q: string) {
  if (!q) return true;
  return name.toLowerCase().includes(q);
}

export function searchProvinces(index: WilayahIndex, q?: string, limit = 80): WilayahListItem[] {
  const nq = normQ(q);
  return index.provinces
    .filter((p) => matchName(p.name, nq))
    .slice(0, limit)
    .map((p) => ({ code: p.code, name: p.name }));
}

export function searchCities(
  index: WilayahIndex,
  provinceCode: string,
  q?: string,
  limit = 80
): WilayahListItem[] {
  const nq = normQ(q);
  const pc = String(provinceCode);
  return index.cities
    .filter((c) => c.provinceCode === pc && matchName(c.name, nq))
    .slice(0, limit)
    .map((c) => ({ code: c.code, name: c.name }));
}

export type KecamatanSearchHit = WilayahListItem & {
  cityCode: string;
  cityName: string;
  provinceCode: string;
  provinceName: string;
};

export function searchSubDistrictsGlobal(
  index: WilayahIndex,
  q?: string,
  limit = 60
): KecamatanSearchHit[] {
  const nq = normQ(q);
  if (!nq || nq.length < 2) return [];

  const cityByCode = new Map(index.cities.map((c) => [c.code, c]));
  const provByCode = new Map(index.provinces.map((p) => [p.code, p]));

  const hits: KecamatanSearchHit[] = [];
  for (const s of index.subDistricts) {
    if (!matchName(s.name, nq)) continue;
    const city = cityByCode.get(s.cityCode);
    const prov = city ? provByCode.get(city.provinceCode) : undefined;
    hits.push({
      code: s.code,
      name: s.name,
      cityCode: s.cityCode,
      cityName: city?.name ?? '',
      provinceCode: city?.provinceCode ?? '',
      provinceName: prov?.name ?? '',
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function wilayahFromKecamatanCode(
  index: WilayahIndex,
  kecamatanCode: string
): SantriAsalWilayahSlice | null {
  const kec = index.subDistricts.find((s) => s.code === String(kecamatanCode));
  if (!kec) return null;
  const city = index.cities.find((c) => c.code === kec.cityCode);
  if (!city) return null;
  const prov = index.provinces.find((p) => p.code === city.provinceCode);
  if (!prov) return null;
  return {
    asal_provinsi_code: prov.code,
    asal_provinsi_nama: prov.name,
    asal_kota_code: city.code,
    asal_kota_nama: city.name,
    asal_kecamatan_code: kec.code,
    asal_kecamatan_nama: kec.name,
    asal_desa_code: '',
    asal_desa_nama: '',
  };
}

/** Potongan field asal untuk form santri */
export type SantriAsalWilayahSlice = {
  asal_provinsi_code: string;
  asal_provinsi_nama: string;
  asal_kota_code: string;
  asal_kota_nama: string;
  asal_kecamatan_code: string;
  asal_kecamatan_nama: string;
  asal_desa_code: string;
  asal_desa_nama: string;
};

export function searchSubDistricts(
  index: WilayahIndex,
  cityCode: string,
  q?: string,
  limit = 80
): WilayahListItem[] {
  const nq = normQ(q);
  const cc = String(cityCode);
  return index.subDistricts
    .filter((s) => s.cityCode === cc && matchName(s.name, nq))
    .slice(0, limit)
    .map((s) => ({ code: s.code, name: s.name }));
}

export function provinceGeo(index: WilayahIndex) {
  return index.provinces.map((p) => ({
    code: p.code,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
  }));
}
