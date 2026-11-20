import type { WilayahListItem } from '@/lib/wilayah-types';

async function wilayahFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || 'Gagal memuat wilayah');
  }
  return data as T;
}

export function fetchProvinces(q?: string) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return wilayahFetch<WilayahListItem[]>(`/api/wilayah/provinces${qs}`);
}

export function fetchCities(provinceCode: string, q?: string) {
  const params = new URLSearchParams({ province: provinceCode });
  if (q) params.set('q', q);
  return wilayahFetch<WilayahListItem[]>(`/api/wilayah/cities?${params}`);
}

export type KecamatanSearchHit = {
  code: string;
  name: string;
  cityCode: string;
  cityName: string;
  provinceCode: string;
  provinceName: string;
};

export function fetchKecamatanCari(q: string) {
  const params = new URLSearchParams({ q });
  return wilayahFetch<KecamatanSearchHit[]>(`/api/wilayah/kecamatan-cari?${params}`);
}

export function fetchKecamatan(cityCode: string, q?: string) {
  const params = new URLSearchParams({ city: cityCode });
  if (q) params.set('q', q);
  return wilayahFetch<WilayahListItem[]>(`/api/wilayah/kecamatan?${params}`);
}

export function fetchDesa(kecamatanCode: string, q?: string) {
  const params = new URLSearchParams({ kecamatan: kecamatanCode });
  if (q) params.set('q', q);
  return wilayahFetch<WilayahListItem[]>(`/api/wilayah/desa?${params}`);
}

export type ProvinceGeo = { code: string; name: string; lat: number; lng: number };

export function fetchProvinceGeo() {
  return wilayahFetch<ProvinceGeo[]>('/api/wilayah/provinces/geo');
}
