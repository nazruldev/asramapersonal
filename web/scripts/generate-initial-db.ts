/**
 * Menulis data/initial-db.json — instalasi baru (kosong, tanpa data demo).
 * Kelas default diisi otomatis saat pertama dibuka (seedDefaultKelasIfEmpty).
 * Jalankan: npx tsx scripts/generate-initial-db.ts
 */
import fs from 'fs';
import path from 'path';
import { DEFAULT_APP_SETTINGS } from '../src/lib/app-settings';

const db = {
  santri: [],
  kamar: [],
  kelas: [],
  kegiatan: [],
  penjadwalan: [],
  penjadwalanPreset: [],
  absensi: [],
  izin: [],
  pembinaan: [],
  riwayat_kamar: [],
  settings: { ...DEFAULT_APP_SETTINGS },
};

const outDir = path.resolve(process.cwd(), 'data');
const outFile = path.join(outDir, 'initial-db.json');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(db, null, 2)}\n`);
console.log(`Wrote ${outFile}`);
