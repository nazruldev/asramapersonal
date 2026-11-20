import fs from 'fs';
import path from 'path';
import type { WilayahIndex } from './wilayah-types';
import { setWilayahIndexCache } from './wilayah-index';

let indexLoaded: WilayahIndex | null = null;

export function getWilayahIndexFromDisk(): WilayahIndex {
  if (indexLoaded) return indexLoaded;
  const file = path.resolve(process.cwd(), 'public/data/wilayah-index.json');
  if (!fs.existsSync(file)) {
    throw new Error('public/data/wilayah-index.json belum ada. Jalankan npm run data:wilayah.');
  }
  indexLoaded = JSON.parse(fs.readFileSync(file, 'utf-8')) as WilayahIndex;
  setWilayahIndexCache(indexLoaded);
  return indexLoaded;
}
