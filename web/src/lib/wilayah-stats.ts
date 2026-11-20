import type { WilayahIndexProvince } from './wilayah-types';
import type { SantriAsalWilayahFields } from './wilayah-types';

export type WilayahAggRow = {
  code: string;
  name: string;
  count: number;
  lat?: number;
  lng?: number;
};

export function aggregateSantriByProvinsi(
  santri: SantriAsalWilayahFields[],
  provinces: WilayahIndexProvince[]
): WilayahAggRow[] {
  const byCode: Record<string, number> = {};
  const nameByCode: Record<string, string> = {};
  for (const p of provinces) {
    nameByCode[p.code] = p.name;
  }

  for (const s of santri) {
    const code = s.asal_provinsi_code ? String(s.asal_provinsi_code) : '';
    if (!code) continue;
    byCode[code] = (byCode[code] ?? 0) + 1;
    if (s.asal_provinsi_nama) nameByCode[code] = s.asal_provinsi_nama;
  }

  const geo = new Map(provinces.map((p) => [p.code, p]));

  return Object.entries(byCode)
    .map(([code, count]) => {
      const g = geo.get(code);
      return {
        code,
        name: nameByCode[code] ?? g?.name ?? code,
        count,
        lat: g?.lat,
        lng: g?.lng,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function aggregateSantriByKota(santri: SantriAsalWilayahFields[]): WilayahAggRow[] {
  const byCode: Record<string, { count: number; name: string; prov?: string }> = {};

  for (const s of santri) {
    const code = s.asal_kota_code ? String(s.asal_kota_code) : '';
    if (!code) continue;
    if (!byCode[code]) {
      byCode[code] = {
        count: 0,
        name: s.asal_kota_nama ?? code,
        prov: s.asal_provinsi_nama,
      };
    }
    byCode[code].count += 1;
    if (s.asal_kota_nama) byCode[code].name = s.asal_kota_nama;
  }

  return Object.entries(byCode)
    .map(([code, v]) => ({
      code,
      name: v.prov ? `${v.name} (${v.prov})` : v.name,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Hanya kecamatan yang punya santri (berdasarkan kode kecamatan di data santri). */
export function aggregateSantriByKecamatan(santri: SantriAsalWilayahFields[]): WilayahAggRow[] {
  const byCode: Record<string, { count: number; name: string; kota?: string; prov?: string }> = {};

  for (const s of santri) {
    const code = s.asal_kecamatan_code ? String(s.asal_kecamatan_code) : '';
    if (!code) continue;
    if (!byCode[code]) {
      byCode[code] = {
        count: 0,
        name: s.asal_kecamatan_nama ?? code,
        kota: s.asal_kota_nama,
        prov: s.asal_provinsi_nama,
      };
    }
    byCode[code].count += 1;
    if (s.asal_kecamatan_nama) byCode[code].name = s.asal_kecamatan_nama;
    if (s.asal_kota_nama) byCode[code].kota = s.asal_kota_nama;
    if (s.asal_provinsi_nama) byCode[code].prov = s.asal_provinsi_nama;
  }

  return Object.entries(byCode)
    .map(([code, v]) => {
      const loc = [v.kota, v.prov].filter((p) => p && String(p).trim()).join(', ');
      return {
        code,
        name: loc ? `${v.name} (${loc})` : v.name,
        count: v.count,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** Proyeksi kasar koordinat Indonesia ke ruang 0–100 (untuk peta bubble) */
export function projectIndonesia(lat: number, lng: number): { x: number; y: number } {
  const minLng = 94.5;
  const maxLng = 141.5;
  const minLat = -11.5;
  const maxLat = 6.5;
  const x = ((lng - minLng) / (maxLng - minLng)) * 100;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 100;
  return { x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)) };
}
