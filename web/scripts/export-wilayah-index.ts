/**
 * Ekspor indeks wilayah (provinsi, kota, kecamatan) + salin wilyah.sqlite ke public/.
 * Jalankan: npx tsx scripts/export-wilayah-index.ts
 */
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

const root = process.cwd();
const sqliteSrc = path.join(root, 'wilyah.sqlite');
const publicDir = path.join(root, 'public');
const publicDataDir = path.join(publicDir, 'data');
const srcDataDir = path.join(root, 'src', 'data');
const indexOutPublic = path.join(publicDataDir, 'wilayah-index.json');
const indexOutSrc = path.join(srcDataDir, 'wilayah-index.json');
const sqliteDest = path.join(publicDir, 'wilyah.sqlite');

if (!fs.existsSync(sqliteSrc)) {
  console.error('wilyah.sqlite tidak ditemukan di root proyek.');
  process.exit(1);
}

fs.mkdirSync(publicDataDir, { recursive: true });
fs.mkdirSync(srcDataDir, { recursive: true });

if (!fs.existsSync(sqliteDest) || fs.statSync(sqliteDest).mtimeMs < fs.statSync(sqliteSrc).mtimeMs) {
  fs.copyFileSync(sqliteSrc, sqliteDest);
  console.log('Disalin:', sqliteDest);
}

const wasmSrc = path.join(root, 'node_modules/sql.js/dist/sql-wasm.wasm');
const wasmDest = path.join(publicDir, 'sql-wasm.wasm');
if (fs.existsSync(wasmSrc)) {
  if (!fs.existsSync(wasmDest) || fs.statSync(wasmDest).mtimeMs < fs.statSync(wasmSrc).mtimeMs) {
    fs.copyFileSync(wasmSrc, wasmDest);
    console.log('Disalin:', wasmDest);
  }
}

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync(sqliteSrc));

type Row = Record<string, string | number | null>;

const provinces = (db.exec(`
  SELECT province_code, province_name, province_latitude, province_longitude
  FROM provinces
  ORDER BY province_name
`) as { columns: string[]; values: (string | number | null)[][] }[])[0];

const provRows =
  provinces?.values.map((v) => ({
    code: String(v[0]),
    name: String(v[1] ?? ''),
    lat: parseFloat(String(v[2] ?? '')) || 0,
    lng: parseFloat(String(v[3] ?? '')) || 0,
  })) ?? [];

const cities = (db.exec(`
  SELECT city_code, city_name, city_province_code, city_latitude, city_longitude
  FROM cities
  ORDER BY city_name
`) as { columns: string[]; values: (string | number | null)[][] }[])[0];

const cityRows =
  cities?.values.map((v) => ({
    code: String(v[0]),
    name: String(v[1] ?? ''),
    provinceCode: String(v[2]),
    lat: parseFloat(String(v[3] ?? '')) || undefined,
    lng: parseFloat(String(v[4] ?? '')) || undefined,
  })) ?? [];

const sub = (db.exec(`
  SELECT sub_district_code, sub_district_name, sub_district_city_code
  FROM sub_districts
  ORDER BY sub_district_name
`) as { columns: string[]; values: (string | number | null)[][] }[])[0];

const subRows =
  sub?.values.map((v) => ({
    code: String(v[0]),
    name: String(v[1] ?? ''),
    cityCode: String(v[2]),
  })) ?? [];

const index = {
  version: 1,
  provinces: provRows,
  cities: cityRows,
  subDistricts: subRows,
};

const indexJson = JSON.stringify(index);
fs.writeFileSync(indexOutPublic, indexJson);
fs.writeFileSync(indexOutSrc, indexJson);
console.log(
  `wilayah-index.json: ${provRows.length} provinsi, ${cityRows.length} kota, ${subRows.length} kecamatan (public + src/data)`
);

db.close();
