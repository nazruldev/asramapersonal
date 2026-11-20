export type WilayahIndexProvince = {
  code: string;
  name: string;
  lat: number;
  lng: number;
};

export type WilayahIndexCity = {
  code: string;
  name: string;
  provinceCode: string;
  lat?: number;
  lng?: number;
};

export type WilayahIndexSubDistrict = {
  code: string;
  name: string;
  cityCode: string;
};

export type WilayahListItem = {
  code: string;
  name: string;
};

export type WilayahIndex = {
  version: number;
  provinces: WilayahIndexProvince[];
  cities: WilayahIndexCity[];
  subDistricts: WilayahIndexSubDistrict[];
};

/** Kolom flat pada record santri untuk asal wilayah */
export type SantriAsalWilayahFields = {
  asal_provinsi_code?: string;
  asal_provinsi_nama?: string;
  asal_kota_code?: string;
  asal_kota_nama?: string;
  asal_kecamatan_code?: string;
  asal_kecamatan_nama?: string;
  asal_desa_code?: string;
  asal_desa_nama?: string;
};

export type AsalWilayahLevel = {
  key: 'provinsi' | 'kota' | 'kecamatan' | 'desa';
  label: string;
  value: string;
};

/** Tingkat wilayah terpisah (desa hanya jika diisi). */
export function asalWilayahDetailLevels(
  row: SantriAsalWilayahFields | null | undefined
): AsalWilayahLevel[] {
  if (!row) return [];
  const levels: AsalWilayahLevel[] = [];
  const prov = row.asal_provinsi_nama?.trim();
  if (prov) levels.push({ key: 'provinsi', label: 'Provinsi', value: prov });
  const kota = row.asal_kota_nama?.trim();
  if (kota) levels.push({ key: 'kota', label: 'Kabupaten/Kota', value: kota });
  const kec = row.asal_kecamatan_nama?.trim();
  if (kec) levels.push({ key: 'kecamatan', label: 'Kecamatan', value: kec });
  const desa = row.asal_desa_nama?.trim();
  if (desa) levels.push({ key: 'desa', label: 'Desa/Kelurahan', value: desa });
  return levels;
}

export function formatAsalWilayah(row: SantriAsalWilayahFields | null | undefined): string {
  const levels = asalWilayahDetailLevels(row);
  if (levels.length === 0) return '—';
  return levels.map((l) => l.value).join(', ');
}

export function formatAsalWilayahShort(row: SantriAsalWilayahFields | null | undefined): string {
  if (!row) return '—';
  if (row.asal_kota_nama && row.asal_provinsi_nama) {
    return `${row.asal_kota_nama}, ${row.asal_provinsi_nama}`;
  }
  if (row.asal_provinsi_nama) return row.asal_provinsi_nama;
  return '—';
}

export function hasAsalWilayah(row: SantriAsalWilayahFields | null | undefined): boolean {
  return Boolean(
    row?.asal_kecamatan_code ||
      row?.asal_kecamatan_nama ||
      row?.asal_kota_code ||
      row?.asal_kota_nama ||
      row?.asal_provinsi_code ||
      row?.asal_provinsi_nama
  );
}
