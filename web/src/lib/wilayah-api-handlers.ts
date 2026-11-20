import type { WilayahIndex } from './wilayah-types';
import {
  provinceGeo,
  searchCities,
  searchProvinces,
  searchSubDistricts,
  searchSubDistrictsGlobal,
} from './wilayah-index';
import { searchVillages } from './wilayah-villages';

export type WilayahApiResult = { status: number; body: unknown };

export async function handleWilayahApi(
  pathname: string,
  searchParams: URLSearchParams,
  index: WilayahIndex
): Promise<WilayahApiResult | null> {
  if (!pathname.startsWith('/api/wilayah')) return null;

  try {
    const q = searchParams.get('q') ?? undefined;

    if (pathname === '/api/wilayah/provinces') {
      return { status: 200, body: searchProvinces(index, q) };
    }

    if (pathname === '/api/wilayah/provinces/geo') {
      return { status: 200, body: provinceGeo(index) };
    }

    if (pathname === '/api/wilayah/cities') {
      const province = searchParams.get('province') ?? '';
      if (!province) {
        return { status: 400, body: { error: 'Parameter province wajib' } };
      }
      return { status: 200, body: searchCities(index, province, q) };
    }

    if (pathname === '/api/wilayah/kecamatan-cari') {
      return { status: 200, body: searchSubDistrictsGlobal(index, q) };
    }

    if (pathname === '/api/wilayah/kecamatan') {
      const city = searchParams.get('city') ?? '';
      if (!city) {
        return { status: 400, body: { error: 'Parameter city wajib' } };
      }
      return { status: 200, body: searchSubDistricts(index, city, q) };
    }

    if (pathname === '/api/wilayah/desa') {
      const kecamatan = searchParams.get('kecamatan') ?? '';
      if (!kecamatan) {
        return { status: 400, body: { error: 'Parameter kecamatan wajib' } };
      }
      const villages = await searchVillages(kecamatan, q);
      return { status: 200, body: villages };
    }

    return { status: 404, body: { error: 'Wilayah tidak ditemukan' } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal memuat wilayah';
    return { status: 500, body: { error: msg } };
  }
}
