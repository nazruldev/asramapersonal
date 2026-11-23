/**
 * Generate contoh HTML + PDF semua jenis laporan ke folder lokal.
 * Jalankan: npx tsx web/scripts/generate-laporan-contoh.ts
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBkWaliDocumentHtml,
  buildLaporanTablesDocumentHtml,
  buildSingleSantriDocumentHtml,
  LAPORAN_TABLE_SECTION_TITLES,
} from '../src/lib/laporan-html-tables.ts';
import type { LaporanContext } from '../src/lib/laporan-reports.ts';
import type { EntityRow } from '../src/store/app-store.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../laporan-contoh');

function daysAgo(n: number, hour = 8, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateOnlyAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildSampleCtx(): LaporanContext {
  const santri: EntityRow[] = [
    {
      id: 's1',
      nama: 'Ahmad Fauzan',
      kelas: 'X IPA 1',
      kamar: 'Kamar 1',
      jumlah_pelanggaran: 3,
      nomor_wali: '081234567890',
      asal_provinsi_nama: 'Jawa Tengah',
      asal_kota_nama: 'Kab. Banyumas',
      asal_kecamatan_nama: 'Sokaraja',
      asal_desa_nama: 'Sokaraja Tengah',
    },
    {
      id: 's2',
      nama: 'Budi Santoso',
      kelas: 'XI IPA 2',
      kamar: 'Kamar 2',
      jumlah_pelanggaran: 1,
      nomor_wali: '081298765432',
      asal_provinsi_nama: 'Jawa Barat',
      asal_kota_nama: 'Kota Bandung',
    },
    {
      id: 's3',
      nama: 'Cahyo Nugroho',
      kelas: 'XII IPS 1',
      kamar: 'Kamar 1',
      jumlah_pelanggaran: 0,
      asal_provinsi_nama: 'DI Yogyakarta',
      asal_kota_nama: 'Kota Yogyakarta',
    },
  ];

  const kamar: EntityRow[] = [
    {
      id: 'k1',
      nama: 'Kamar 1',
      kapasitas: 4,
      ketua: 'Ahmad Fauzan',
      santriList: [{ nama: 'Ahmad Fauzan' }, { nama: 'Cahyo Nugroho' }],
    },
    {
      id: 'k2',
      nama: 'Kamar 2',
      kapasitas: 4,
      ketua: 'Budi Santoso',
      santriList: [{ nama: 'Budi Santoso' }],
    },
  ];

  const kegiatan = [
    {
      id: 'kg1',
      nama: 'Sholat Subuh',
      jenis: 'Ibadah',
      jam_mulai: '04:30',
      jam_selesai: '05:00',
      hari_aktif: [0, 1, 2, 3, 4, 5, 6],
    },
    {
      id: 'kg2',
      nama: 'Belajar Malam',
      jenis: 'Belajar',
      jam_mulai: '19:30',
      jam_selesai: '21:00',
      hari_aktif: [1, 2, 3, 4, 5],
    },
  ];

  const absensi: EntityRow[] = [
    {
      id: 'a1',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      kegiatan_id: 'kg1',
      kegiatan_nama: 'Sholat Subuh',
      tanggal: daysAgo(1, 5),
      status: 'Hadir',
    },
    {
      id: 'a2',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      kegiatan_id: 'kg2',
      kegiatan_nama: 'Belajar Malam',
      tanggal: daysAgo(2, 20),
      status: 'Alpa',
    },
    {
      id: 'a3',
      santri_id: 's2',
      santri_nama: 'Budi Santoso',
      kegiatan_id: 'kg1',
      kegiatan_nama: 'Sholat Subuh',
      tanggal: daysAgo(1, 5),
      status: 'Sakit',
    },
    {
      id: 'a4',
      santri_id: 's3',
      santri_nama: 'Cahyo Nugroho',
      kegiatan_id: 'kg1',
      kegiatan_nama: 'Sholat Subuh',
      tanggal: daysAgo(1, 5),
      status: 'Hadir',
    },
    {
      id: 'a5',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      kegiatan_id: 'kg1',
      kegiatan_nama: 'Sholat Subuh',
      tanggal: daysAgo(3, 5),
      status: 'Izin',
    },
  ];

  const izin: EntityRow[] = [
    {
      id: 'i1',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      santri_kamar: 'Kamar 1',
      tanggal_keluar: daysAgo(5, 9),
      batas_kembali: daysAgo(5, 12),
      status_kembali: 'Sudah',
      alasan: 'Kontrol dokter',
      penjemput: 'Ayah',
    },
    {
      id: 'i2',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      santri_kamar: 'Kamar 1',
      tanggal_keluar: daysAgo(2, 14),
      batas_kembali: daysAgo(2, 18),
      status_kembali: 'Sudah',
      alasan: 'Keperluan keluarga',
      penjemput: 'Kakak',
    },
    {
      id: 'i3',
      santri_id: 's2',
      santri_nama: 'Budi Santoso',
      santri_kamar: 'Kamar 2',
      tanggal_keluar: daysAgo(0, 8),
      batas_kembali: daysAgo(0, 17),
      status_kembali: 'Belum',
      alasan: 'Urusan administrasi',
      penjemput: 'Ibu',
    },
  ];

  const pembinaan: EntityRow[] = [
    {
      id: 'p1',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      santri_kamar: 'Kamar 1',
      jenis: 'Pelanggaran',
      tanggal: dateOnlyAgo(10),
      keterangan: 'Terlambat sholat berjamaah',
      tindak_lanjut: 'Peringatan lisan',
    },
    {
      id: 'p2',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      santri_kamar: 'Kamar 1',
      jenis: 'Teguran',
      tanggal: dateOnlyAgo(7),
      keterangan: 'Kamar kurang rapi',
      tindak_lanjut: 'Razia kamar',
    },
    {
      id: 'p3',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      santri_kamar: 'Kamar 1',
      jenis: 'Pelanggaran',
      tanggal: dateOnlyAgo(3),
      keterangan: 'Membawa HP tanpa izin',
      tindak_lanjut: 'HP disita 3 hari',
    },
    {
      id: 'p4',
      santri_id: 's2',
      santri_nama: 'Budi Santoso',
      santri_kamar: 'Kamar 2',
      jenis: 'Pelanggaran',
      tanggal: dateOnlyAgo(4),
      keterangan: 'Tidak ikut kegiatan malam',
      tindak_lanjut: 'Tugas tambahan',
    },
  ];

  const bulan = dateOnlyAgo(0).slice(0, 7);
  const tagihan: EntityRow[] = [
    {
      id: 't1',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      kelas: 'X IPA 1',
      kamar: 'Kamar 1',
      jenis_nama: 'SPP Bulanan',
      periode: bulan,
      nominal: 500000,
      terbayar: 200000,
      sisa: 300000,
      status: 'sebagian',
    },
    {
      id: 't2',
      santri_id: 's1',
      santri_nama: 'Ahmad Fauzan',
      kelas: 'X IPA 1',
      kamar: 'Kamar 1',
      jenis_nama: 'Uang Makan',
      periode: bulan,
      nominal: 350000,
      terbayar: 0,
      sisa: 350000,
      status: 'belum',
    },
    {
      id: 't3',
      santri_id: 's2',
      santri_nama: 'Budi Santoso',
      kelas: 'XI IPA 2',
      kamar: 'Kamar 2',
      jenis_nama: 'SPP Bulanan',
      periode: bulan,
      nominal: 500000,
      terbayar: 500000,
      sisa: 0,
      status: 'lunas',
    },
    {
      id: 't4',
      santri_id: 's3',
      santri_nama: 'Cahyo Nugroho',
      kelas: 'XII IPS 1',
      kamar: 'Kamar 1',
      jenis_nama: 'SPP Bulanan',
      periode: bulan,
      nominal: 500000,
      terbayar: 100000,
      sisa: 400000,
      status: 'sebagian',
    },
  ];

  return {
    namaAsrama: 'Asrama Contoh Al-Khairaat',
    period: '30d',
    stats: {
      totalSantri: 3,
      sedangIzin: 1,
      hadirTerakhir: 2,
      kegiatanTerakhir: 'Sholat Subuh',
      belumKembali: 1,
      totalKapasitas: 8,
      totalTerisi: 3,
      sisaRanjang: 5,
    },
    santri,
    kamar,
    absensi,
    izin,
    pembinaan,
    tagihan,
    kegiatan,
    wilayahProvinsiGeo: [
      { code: '33', name: 'JAWA TENGAH', lat: -7.15, lng: 110.14 },
      { code: '32', name: 'JAWA BARAT', lat: -6.9, lng: 107.6 },
      { code: '34', name: 'DI YOGYAKARTA', lat: -7.8, lng: 110.4 },
    ],
  };
}

function filterOneSantri(ctx: LaporanContext, santriId: string): LaporanContext {
  const s = ctx.santri.find((x) => String(x.id) === santriId)!;
  const nama = String(s.nama);
  const match = (row: EntityRow) =>
    String(row.santri_id ?? '') === santriId || String(row.santri_nama ?? '') === nama;
  return {
    ...ctx,
    santri: [s],
    absensi: ctx.absensi.filter(match),
    izin: ctx.izin.filter(match),
    pembinaan: ctx.pembinaan.filter(match),
  };
}

function findBrowser(): string | null {
  const candidates = [
    process.env.EDGE_PATH,
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function htmlToPdf(browser: string, htmlPath: string, pdfPath: string): boolean {
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
  const r = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      fileUrl,
    ],
    { encoding: 'utf8', timeout: 60000 }
  );
  return r.status === 0 && fs.existsSync(pdfPath);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const now = new Date();
  const ctx = buildSampleCtx();
  const one = filterOneSantri(ctx, 's1');

  const jobs: { name: string; html: string }[] = [
    {
      name: '01-paket-lengkap-semua-santri',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: 'Paket laporan lengkap (contoh)',
      }),
    },
    {
      name: '02-harian',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.harian,
        ids: ['harian'],
      }),
    },
    {
      name: '03-absensi-semua',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.absensi,
        ids: ['absensi'],
      }),
    },
    {
      name: '04-izin-semua-santri',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.izin,
        ids: ['izin'],
      }),
    },
    {
      name: '05-izin-satu-santri',
      html: buildLaporanTablesDocumentHtml(one, now, {
        title: `${LAPORAN_TABLE_SECTION_TITLES.izin} — Ahmad Fauzan`,
        ids: ['izin'],
      }),
    },
    {
      name: '06-pembinaan-semua-santri',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.pembinaan,
        ids: ['pembinaan'],
      }),
    },
    {
      name: '07-pembinaan-satu-santri',
      html: buildLaporanTablesDocumentHtml(one, now, {
        title: `${LAPORAN_TABLE_SECTION_TITLES.pembinaan} — Ahmad Fauzan`,
        ids: ['pembinaan'],
      }),
    },
    {
      name: '08-kamar',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.kamar,
        ids: ['kamar'],
      }),
    },
    {
      name: '09-kelas',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.kelas,
        ids: ['kelas'],
      }),
    },
    {
      name: '10-peringkat-pelanggaran',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.pelanggaran,
        ids: ['pelanggaran'],
      }),
    },
    {
      name: '11-wilayah',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.wilayah,
        ids: ['wilayah'],
      }),
    },
    {
      name: '12-per-santri-semua',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.persantri,
        ids: ['persantri'],
      }),
    },
    {
      name: '13-laporan-lengkap-satu-santri',
      html: buildSingleSantriDocumentHtml(ctx, 's1', now),
    },
    {
      name: '14-pdf-bk-ke-orangtua',
      html: buildBkWaliDocumentHtml({
        namaAsrama: ctx.namaAsrama,
        santri: {
          nama: 'Ahmad Fauzan',
          kelas: 'X IPA 1',
          kamar: 'Kamar 1',
          nomorWali: '081234567890',
          poinAkumulasi: 3,
          tierLabel: 'Perhatian',
        },
        records: ctx.pembinaan
          .filter((p) => String(p.santri_id) === 's1')
          .map((p) => ({
            tanggal: String(p.tanggal),
            jenis: String(p.jenis),
            keterangan: String(p.keterangan ?? ''),
            tindak_lanjut: String(p.tindak_lanjut ?? ''),
          })),
        now,
      }),
    },
    {
      name: '15-pembayaran-rekap',
      html: buildLaporanTablesDocumentHtml(ctx, now, {
        title: LAPORAN_TABLE_SECTION_TITLES.pembayaran,
        ids: ['pembayaran'],
      }),
    },
  ];

  const indexRows: string[] = [];
  for (const job of jobs) {
    const htmlPath = path.join(OUT_DIR, `${job.name}.html`);
    fs.writeFileSync(htmlPath, job.html, 'utf8');
    indexRows.push(`<li><a href="./${job.name}.html">${job.name}</a></li>`);
    console.log('HTML', job.name);
  }

  const browser = findBrowser();
  let pdfOk = 0;
  if (browser) {
    console.log('Browser:', browser);
    for (const job of jobs) {
      const htmlPath = path.join(OUT_DIR, `${job.name}.html`);
      const pdfPath = path.join(OUT_DIR, `${job.name}.pdf`);
      const ok = htmlToPdf(browser, htmlPath, pdfPath);
      if (ok) {
        pdfOk += 1;
        console.log('PDF ', job.name);
      } else {
        console.warn('PDF gagal:', job.name);
      }
    }
  } else {
    console.warn('Chrome/Edge tidak ditemukan — hanya HTML yang dibuat.');
  }

  const readme = `# Contoh Laporan PDF/HTML

Folder ini berisi contoh tampilan semua jenis laporan (data dummy).

## Cara lihat
1. Buka file \`.html\` di browser, atau
2. Buka file \`.pdf\` jika berhasil digenerate (${pdfOk}/${jobs.length}).

## Daftar
${jobs.map((j) => `- \`${j.name}\``).join('\n')}

## Regenerate
\`\`\`bash
npx tsx web/scripts/generate-laporan-contoh.ts
\`\`\`
`;
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme, 'utf8');
  fs.writeFileSync(
    path.join(OUT_DIR, 'index.html'),
    `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"/><title>Contoh Laporan</title>
<style>body{font-family:system-ui;padding:24px;line-height:1.5}li{margin:6px 0}</style>
</head><body><h1>Contoh Laporan AsramaPersonal</h1><ol>${indexRows.join('')}</ol>
<p>PDF: ${pdfOk}/${jobs.length} berhasil dibuat.</p></body></html>`,
    'utf8'
  );

  console.log(`\nSelesai → ${OUT_DIR}`);
  console.log(`PDF: ${pdfOk}/${jobs.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
