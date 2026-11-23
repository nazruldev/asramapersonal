/**
 * Verifikasi handler CRUD inti (tanpa UI).
 * Jalankan: cd web && tsx --tsconfig tsconfig.json scripts/verify-crud-handlers.ts
 */
import {
  handleAsramaCreate,
  handleAsramaDelete,
  handleAsramaUpdate,
  handlePenggunaCreate,
  handlePenggunaUpdate,
} from '../src/lib/auth-api';
import {
  computePelanggaranPeriodRanks,
  computePembayaranRekap,
  type LaporanContext,
} from '../src/lib/laporan-reports';
import { sisaTagihan } from '../src/lib/pembayaran-store';

function statusOf(nominal: number, terbayar: number): 'belum' | 'sebagian' | 'lunas' {
  if (nominal > 0 && terbayar >= nominal) return 'lunas';
  if (terbayar > 0) return 'sebagian';
  return 'belum';
}
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../src/lib/app-settings';
import { laporanMonthsFromPeriod } from '../src/lib/laporan-data-api';

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function cloneSettings(): AppSettings {
  return structuredClone({
    ...DEFAULT_APP_SETTINGS,
    asrama: [{ id: 'a1', nama: 'Asrama Putra', jenis: 'PUTRA' }],
    pengguna: [],
  });
}

let idSeq = 1;
const newId = () => `id-${idSeq++}`;

// ——— Asrama CRUD ———
{
  const s = cloneSettings();
  const created = handleAsramaCreate(s, { nama: 'Asrama Putri', jenis: 'PUTRI' }, newId);
  assert('asrama create ok', created.status === 200, String(created.status));
  const createdId = (created.body as { id?: string }).id!;

  const dup = handleAsramaCreate(s, { nama: 'asrama putri', jenis: 'PUTRI' }, newId);
  assert('asrama create reject dup nama', dup.status === 400);

  const badJenis = handleAsramaCreate(s, { nama: 'X', jenis: 'INVALID' }, newId);
  assert('asrama create reject jenis invalid', badJenis.status === 400);

  const updated = handleAsramaUpdate(s, createdId, { nama: 'Asrama Putri A', jenis: 'PUTRI' });
  assert('asrama update ok', updated.status === 200 && (updated.body as { nama: string }).nama === 'Asrama Putri A');

  const delBlocked = handleAsramaDelete(s, createdId, true);
  assert('asrama delete blocked when inUse', delBlocked.status === 400);

  const delOk = handleAsramaDelete(s, createdId, false);
  assert('asrama delete ok', delOk.status === 200 && s.asrama.every((a) => a.id !== createdId));

  const delLast = handleAsramaDelete(s, 'a1', false);
  assert('asrama delete reject last one', delLast.status === 400);
}

// ——— Pengguna CRUD ———
{
  const s = cloneSettings();
  const admin = handlePenggunaCreate(
    s,
    { nama: 'Admin', pin: '123456', role: 'super_admin', asramaIds: [], akses: [], aktif: true },
    newId
  );
  assert('pengguna create super_admin', admin.status === 200);

  const pengawasBad = handlePenggunaCreate(
    s,
    { nama: 'Pengawas', pin: '654321', role: 'pengawas', asramaIds: [], akses: ['izin'], aktif: true },
    newId
  );
  assert('pengguna pengawas tanpa asrama ditolak', pengawasBad.status === 400);

  const pengawas = handlePenggunaCreate(
    s,
    {
      nama: 'Pengawas',
      pin: '654321',
      role: 'pengawas',
      asramaIds: ['a1'],
      akses: ['izin', 'pembinaan'],
      aktif: true,
    },
    newId
  );
  assert('pengguna create pengawas', pengawas.status === 200);
  const pid = (penggunaBodyId(pengawas.body));

  const upd = handlePenggunaUpdate(s, pid, { nama: 'Pengawas 1', akses: ['izin'] });
  assert('pengguna update ok', upd.status === 200 && (upd.body as { nama: string }).nama === 'Pengawas 1');
}

function penggunaBodyId(body: unknown): string {
  return String((body as { id?: string }).id ?? '');
}

// ——— Pembayaran helpers ———
{
  assert('sisaTagihan dasar', sisaTagihan({ nominal: 100_000, terbayar: 40_000 }) === 60_000);
  assert('statusOf sebagian', statusOf(100_000, 40_000) === 'sebagian');
  assert('statusOf lunas', statusOf(100_000, 100_000) === 'lunas');
  assert('statusOf belum', statusOf(100_000, 0) === 'belum');

  const ctx = {
    namaAsrama: 'Test',
    period: 'month' as const,
    stats: null,
    santri: [],
    kamar: [],
    absensi: [],
    izin: [],
    pembinaan: [],
    tagihan: [
      {
        id: 't1',
        santri_id: 's1',
        santri_nama: 'Ali',
        santri_kelas: 'VII',
        santri_kamar: 'A1',
        nama_jenis: 'SPP',
        nominal: 100_000,
        terbayar: 20_000,
        sisa: 80_000,
        status: 'sebagian',
        jatuh_tempo: '2020-01-01',
      },
      {
        id: 't2',
        santri_id: 's2',
        santri_nama: 'Budi',
        santri_kelas: 'VII',
        santri_kamar: 'A2',
        nama_jenis: 'SPP',
        nominal: 100_000,
        terbayar: 100_000,
        sisa: 0,
        status: 'lunas',
        jatuh_tempo: '2020-01-01',
      },
      {
        id: 't3',
        santri_id: 's3',
        santri_nama: 'Cici',
        santri_kelas: 'VII',
        santri_kamar: 'A3',
        nama_jenis: 'SPP',
        nominal: 50_000,
        terbayar: 0,
        sisa: 50_000,
        status: 'belum',
        jatuh_tempo: '2099-12-31', // belum jatuh tempo → bukan tunggakan
      },
    ],
  } as unknown as LaporanContext;

  const rekap = computePembayaranRekap(ctx);
  assert('pembayaran rekap totalTagihan', rekap.totalTagihan === 3);
  assert('pembayaran rekap sisa', rekap.totalSisa === 130_000);
  assert(
    'pembayaran rekap tunggakan hanya yang lewat jatuh tempo',
    rekap.tunggakan.length === 1 && rekap.tunggakan[0]?.nama === 'Ali',
    `len=${rekap.tunggakan.length}`
  );
  assert(
    'pembayaran rekap belumLunas hanya dalam tempo',
    rekap.belumLunas.length === 1 && rekap.belumLunas[0]?.nama === 'Cici',
    `len=${rekap.belumLunas.length}`
  );
  assert('pembayaran rekap sisa tunggakan', rekap.totalSisaTunggakan === 80_000);
  assert('pembayaran rekap sisa dalam tempo', rekap.totalSisaDalamTempo === 50_000);
  assert('pembayaran rekap byJenis SPP', rekap.byJenis[0]?.nama === 'SPP');
}

// ——— Pelanggaran periode ———
{
  const ctx = {
    namaAsrama: 'Test',
    period: '30d' as const,
    stats: null,
    santri: [
      { id: 's1', nama: 'Ali', kelas: 'VII', kamar: 'A1', jumlah_pelanggaran: 99 },
      { id: 's2', nama: 'Budi', kelas: 'VII', kamar: 'A2', jumlah_pelanggaran: 5 },
    ],
    kamar: [],
    absensi: [],
    izin: [],
    pembinaan: [
      {
        santri_id: 's1',
        santri_nama: 'Ali',
        jenis: 'Pelanggaran',
        tanggal: new Date().toISOString(),
      },
      {
        santri_id: 's1',
        santri_nama: 'Ali',
        jenis: 'Pelanggaran',
        tanggal: new Date().toISOString(),
      },
      {
        santri_id: 's2',
        santri_nama: 'Budi',
        jenis: 'Teguran',
        tanggal: new Date().toISOString(),
      },
    ],
  } as unknown as LaporanContext;

  const ranks = computePelanggaranPeriodRanks(ctx);
  assert('pelanggaran periode hanya hitung Pelanggaran', ranks.length === 1 && ranks[0]?.count === 2);
  assert('pelanggaran periode abaikan akumulasi profil', ranks[0]?.nama === 'Ali');
}

// ——— Mapping bulan laporan ———
{
  const months = laporanMonthsFromPeriod('month');
  assert('laporan months month = 1', months.length === 1 && /^\d{4}-\d{2}$/.test(months[0]!));
  const custom = laporanMonthsFromPeriod('custom', { dari: '2026-01-15', sampai: '2026-03-02' });
  assert(
    'laporan months custom span 3',
    custom.join(',') === '2026-01,2026-02,2026-03',
    custom.join(',')
  );
}

const failed = checks.filter((c) => !c.ok);
console.log('\n———');
console.log(`Total: ${checks.length} | PASS: ${checks.length - failed.length} | FAIL: ${failed.length}`);
if (failed.length) {
  console.error('GAGAL:');
  for (const f of failed) console.error(` - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exit(1);
}
console.log('SEMUA CEK HANDLER LULUS');
