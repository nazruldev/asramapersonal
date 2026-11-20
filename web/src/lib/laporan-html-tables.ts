/**
 * Builder HTML laporan berbentuk tabel (untuk unduh PDF/HTML).
 * Format WhatsApp tetap di laporan-reports.ts (untuk kirim WA).
 */
import { format, parse } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { formatIzinBatasKembali } from '@/lib/izin-group';
import { formatAsalWilayah, hasAsalWilayah, type SantriAsalWilayahFields } from '@/lib/wilayah-types';
import {
  aggregateSantriByKecamatan,
  aggregateSantriByKota,
  aggregateSantriByProvinsi,
} from '@/lib/wilayah-stats';
import type { WilayahIndexProvince } from '@/lib/wilayah-types';
import type { EntityRow } from '@/store/app-store';
import {
  ABSENSI_STATUS_ORDER,
  computeAbsensiRekap,
  computeLaporanSummary,
  laporanRekapInterval,
  periodLabel,
  type AbsensiStatusCounts,
  type LaporanContext,
  type LaporanReportId,
} from '@/lib/laporan-reports';

export function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowDate(row: EntityRow, field: string): string {
  const v = row[field];
  return typeof v === 'string' ? v : '';
}

function inCtxPeriod(iso: string, ctx: LaporanContext, now: Date): boolean {
  if (!iso) return false;
  const { start, end } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

function fmtLongDate(d = new Date()) {
  return format(d, 'EEEE, d MMMM yyyy', { locale: localeId });
}

function fmtShortDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  return format(d, 'd MMM yyyy HH:mm', { locale: localeId });
}

function fmtShortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  return format(d, 'd MMM yyyy', { locale: localeId });
}

function countsCells(counts: AbsensiStatusCounts): string[] {
  return ABSENSI_STATUS_ORDER.map((st) => String(counts[st] ?? 0));
}

function statusHeaders(): string[] {
  return [...ABSENSI_STATUS_ORDER];
}

export function htmlTable(headers: string[], rows: (string | number)[][], emptyNote = 'Tidak ada data'): string {
  if (!rows.length) {
    return `<p class="empty">${escapeHtml(emptyNote)}</p>`;
  }
  const thead = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const tbody = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${escapeHtml(String(c ?? '—'))}</td>`).join('')}</tr>`
    )
    .join('');
  return `<table class="data"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function kvTable(pairs: [string, string | number][]): string {
  const rows = pairs.map(([k, v]) => [k, String(v)]);
  return htmlTable(['Keterangan', 'Nilai'], rows);
}

function section(title: string, body: string, subtitle = ''): string {
  const sub = subtitle
    ? `<p class="section-sub">${escapeHtml(subtitle)}</p>`
    : '';
  return `<section class="report-section"><h2>${escapeHtml(title)}</h2>${sub}${body}</section>`;
}

function h3(title: string): string {
  return `<h3 class="subhead">${escapeHtml(title)}</h3>`;
}

export const LAPORAN_PRINT_CSS = `
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    font-size: 9.5pt;
    line-height: 1.4;
    color: #0f172a;
    margin: 0;
    padding: 0;
  }
  .doc-header {
    border-bottom: 2.5px solid #047857;
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .doc-header h1 {
    font-size: 15pt;
    margin: 0 0 4px;
    color: #065f46;
  }
  .doc-header .meta {
    font-size: 8.5pt;
    color: #475569;
    margin: 0;
    line-height: 1.5;
  }
  .report-section {
    break-inside: avoid-page;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e2e8f0;
  }
  .report-section:last-of-type { border-bottom: none; }
  .report-section h2 {
    font-size: 11pt;
    color: #047857;
    margin: 0 0 4px;
  }
  .section-sub {
    font-size: 8pt;
    color: #64748b;
    margin: 0 0 8px;
  }
  .subhead {
    font-size: 9pt;
    color: #334155;
    margin: 10px 0 4px;
  }
  table.data {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 8px;
    font-size: 8pt;
  }
  table.data th,
  table.data td {
    border: 1px solid #cbd5e1;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }
  table.data th {
    background: #ecfdf5;
    color: #065f46;
    font-weight: 700;
  }
  table.data tr:nth-child(even) td { background: #f8fafc; }
  table.data td:last-child, table.data th:last-child {
    text-align: right;
  }
  table.data.cols-left td:last-child,
  table.data.cols-left th:last-child {
    text-align: left;
  }
  .empty {
    font-size: 8.5pt;
    color: #94a3b8;
    font-style: italic;
    margin: 4px 0 8px;
  }
  .doc-footer {
    margin-top: 16px;
    font-size: 7.5pt;
    color: #94a3b8;
    text-align: center;
  }
  .santri-block {
    break-inside: avoid;
    margin-bottom: 12px;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 2px;
  }
  .santri-block h4 {
    margin: 0 0 6px;
    font-size: 9.5pt;
    color: #0f172a;
  }
  .santri-meta {
    font-size: 8pt;
    color: #64748b;
    margin: 0 0 6px;
  }
  @media screen {
    body { padding: 16px; max-width: 210mm; margin: 0 auto; }
  }
`;

function buildHarianHtml(ctx: LaporanContext, now: Date): string {
  const summary = computeLaporanSummary(ctx, now);
  const activeIzin = ctx.izin.filter((i) => i.status_kembali === 'Belum');
  const ringkas = kvTable([
    ['Total santri', `${summary.totalSantri} orang`],
    ['Hadir di asrama', `${summary.diAsrama} orang`],
    ['Sedang izin / di luar', `${summary.activeIzinCount} orang`],
    ['Kapasitas kamar', String(summary.kapasitas)],
    ['Terisi', String(summary.terisi)],
    ['Sisa slot', String(summary.sisa)],
    ['Kegiatan terakhir', String(summary.kegiatanTerakhir)],
    ['Kehadiran terakhir', `${summary.hadirTerakhir} santri`],
  ]);

  const izinRows = activeIzin.map((i, idx) => [
    idx + 1,
    String(i.santri_nama ?? '—'),
    String(i.santri_kamar ?? '—'),
    String(i.alasan ?? '—'),
    formatIzinBatasKembali(rowDate(i, 'batas_kembali')),
  ]);

  const overdueRows = summary.overdueIzin.map((i, idx) => [
    idx + 1,
    String(i.santri_nama ?? '—'),
    formatIzinBatasKembali(rowDate(i, 'batas_kembali')),
  ]);

  return [
    h3('Ringkasan kondisi'),
    ringkas,
    h3('Santri sedang izin'),
    htmlTable(
      ['No', 'Nama', 'Kamar', 'Alasan', 'Batas kembali'],
      izinRows,
      'Tidak ada — semua di asrama'
    ),
    summary.overdueIzin.length
      ? `${h3('Izin lewat batas')}${htmlTable(['No', 'Nama', 'Batas seharusnya'], overdueRows)}`
      : '',
  ].join('');
}

function buildAbsensiHtml(ctx: LaporanContext, now: Date): string {
  const rekap = computeAbsensiRekap(ctx, now);
  const totalRow = ['TOTAL', ...countsCells(rekap.totalByStatus), rekap.totalCatatan];
  const kegRows = rekap.perKegiatan.map((k) => [
    k.nama,
    k.hariJadwal,
    ...countsCells(k.counts),
    k.totalCatatan,
  ]);

  let harian = '';
  if (rekap.dateKeys.length <= 14 && rekap.harian.length > 0) {
    const rows = rekap.harian.map((h) => [
      format(parse(h.dateKey, 'yyyy-MM-dd', new Date()), 'd MMM yyyy', { locale: localeId }),
      h.kegiatan,
      ...countsCells(h.counts),
      h.totalCatatan,
    ]);
    harian = `${h3('Rincian per hari & kegiatan')}${htmlTable(
      ['Tanggal', 'Kegiatan', ...statusHeaders(), 'Total'],
      rows
    )}`;
  } else if (rekap.dateKeys.length > 14) {
    harian = `<p class="empty">Periode &gt; 14 hari — rincian harian disembunyikan; lihat agregat per kegiatan.</p>`;
  }

  return [
    h3('Ringkasan status'),
    htmlTable(['', ...statusHeaders(), 'Total catatan'], [totalRow]),
    h3('Per kegiatan'),
    htmlTable(
      ['Kegiatan', 'Hari jadwal', ...statusHeaders(), 'Total'],
      kegRows,
      'Belum ada kegiatan / catatan absensi'
    ),
    harian,
  ].join('');
}

function buildIzinHtml(ctx: LaporanContext, now: Date): string {
  const rows = ctx.izin.filter((i) => inCtxPeriod(rowDate(i, 'tanggal_keluar'), ctx, now));
  const belum = rows.filter((i) => i.status_kembali === 'Belum').length;
  const sudah = rows.filter((i) => i.status_kembali === 'Sudah').length;
  const tableRows = rows.map((i, idx) => [
    idx + 1,
    String(i.santri_nama ?? '—'),
    String(i.santri_kamar ?? '—'),
    i.status_kembali === 'Belum' ? 'Belum kembali' : 'Sudah kembali',
    fmtShortDateTime(rowDate(i, 'tanggal_keluar')),
    formatIzinBatasKembali(rowDate(i, 'batas_kembali')),
    String(i.alasan ?? '—'),
    String(i.penjemput ?? '—'),
  ]);

  return [
    kvTable([
      ['Total izin', rows.length],
      ['Belum kembali', belum],
      ['Sudah kembali', sudah],
    ]),
    h3('Rincian'),
    htmlTable(
      ['No', 'Nama', 'Kamar', 'Status', 'Keluar', 'Batas', 'Alasan', 'Penjemput'],
      tableRows,
      'Tidak ada izin pada periode ini'
    ),
  ].join('');
}

function buildPembinaanHtml(ctx: LaporanContext, now: Date): string {
  const rows = ctx.pembinaan.filter((p) => inCtxPeriod(rowDate(p, 'tanggal'), ctx, now));
  const summary = computeLaporanSummary(ctx, now);
  const jenisRows = Object.entries(summary.bkByJenis).map(([j, n]) => [j, n]);
  const detail = rows.map((p, idx) => [
    idx + 1,
    String(p.santri_nama ?? '—'),
    String(p.santri_kamar ?? '—'),
    String(p.jenis ?? '—'),
    fmtShortDate(rowDate(p, 'tanggal')),
    String(p.keterangan ?? '—'),
    String(p.tindak_lanjut ?? '—'),
  ]);

  return [
    h3('Ringkasan jenis'),
    htmlTable(['Jenis', 'Jumlah'], jenisRows, 'Belum ada'),
    h3('Rincian'),
    htmlTable(
      ['No', 'Nama', 'Kamar', 'Jenis', 'Tanggal', 'Keterangan', 'Tindak lanjut'],
      detail,
      'Belum ada catatan pelanggaran/pembinaan pada periode ini'
    ),
  ].join('');
}

function buildKamarHtml(ctx: LaporanContext): string {
  const summary = computeLaporanSummary(ctx);
  const rows = ctx.kamar.map((k, idx) => {
    const nama = String(k.nama ?? `Kamar ${idx + 1}`);
    const kap = Number(k.kapasitas ?? 0);
    const list = (k.santriList as { nama?: string }[] | undefined) ?? [];
    const terisi = list.length || ctx.santri.filter((s) => s.kamar === nama).length;
    return [idx + 1, nama, terisi, kap, Math.max(0, kap - terisi), String(k.ketua ?? '—')];
  });

  return [
    kvTable([
      ['Kapasitas', summary.kapasitas],
      ['Terisi', summary.terisi],
      ['Sisa', summary.sisa],
    ]),
    h3('Per kamar'),
    htmlTable(['No', 'Kamar', 'Terisi', 'Kapasitas', 'Sisa', 'Ketua'], rows, 'Belum ada data kamar'),
  ].join('');
}

function buildKelasHtml(ctx: LaporanContext): string {
  const byKelas: Record<string, number> = {};
  for (const s of ctx.santri) {
    const kelas = String(s.kelas ?? 'Tanpa kelas');
    byKelas[kelas] = (byKelas[kelas] ?? 0) + 1;
  }
  const rows = Object.entries(byKelas)
    .sort((a, b) => b[1] - a[1])
    .map(([kelas, n], idx) => [idx + 1, kelas, n]);

  return htmlTable(['No', 'Kelas', 'Jumlah santri'], rows, 'Belum ada data santri');
}

function buildPelanggaranHtml(ctx: LaporanContext): string {
  const ranked = [...ctx.santri]
    .map((s) => ({
      nama: String(s.nama ?? 'Santri'),
      kamar: String(s.kamar ?? '—'),
      kelas: String(s.kelas ?? '—'),
      poin: Number(s.jumlah_pelanggaran ?? 0),
    }))
    .filter((s) => s.poin > 0)
    .sort((a, b) => b.poin - a.poin);

  const rows = ranked.map((s, idx) => [idx + 1, s.nama, s.kelas, s.kamar, s.poin]);
  return htmlTable(
    ['Peringkat', 'Nama', 'Kelas', 'Kamar', 'Akumulasi'],
    rows,
    'Belum ada santri dengan hitungan pelanggaran'
  );
}

function buildWilayahHtml(ctx: LaporanContext): string {
  const santri = ctx.santri as SantriAsalWilayahFields[];
  const withAsal = santri.filter((s) => hasAsalWilayah(s));
  const provinces: WilayahIndexProvince[] = (ctx.wilayahProvinsiGeo ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
  }));
  const rankedProv = aggregateSantriByProvinsi(santri, provinces);
  const rankedKota = aggregateSantriByKota(santri);
  const rankedKecamatan = aggregateSantriByKecamatan(santri);

  const mapRows = (items: { name: string; count: number }[]) =>
    items.map((r, idx) => [idx + 1, r.name, r.count]);

  const detail = withAsal.map((s, idx) => {
    const nama = String((s as EntityRow & { nama?: string }).nama ?? 'Santri');
    return [idx + 1, nama, formatAsalWilayah(s)];
  });

  return [
    kvTable([['Data asal terisi', `${withAsal.length} / ${santri.length} santri`]]),
    h3('Provinsi'),
    htmlTable(['No', 'Provinsi', 'Jumlah'], mapRows(rankedProv), 'Belum ada'),
    h3('Kota/Kabupaten (15 teratas)'),
    htmlTable(['No', 'Kota/Kab', 'Jumlah'], mapRows(rankedKota.slice(0, 15)), 'Belum ada'),
    h3('Kecamatan (20 teratas)'),
    htmlTable(['No', 'Kecamatan', 'Jumlah'], mapRows(rankedKecamatan.slice(0, 20)), 'Belum ada'),
    h3('Daftar per santri'),
    htmlTable(['No', 'Nama', 'Asal'], detail, 'Belum ada santri dengan asal wilayah'),
  ].join('');
}

export type SantriLaporanRow = {
  id: string;
  nama: string;
  kamar: string;
  kelas: string;
  absensi: number;
  hadir: number;
  alpa: number;
  izinCount: number;
  bkCount: number;
  poin: number;
};

export function computePerSantriRows(ctx: LaporanContext, now = new Date()): SantriLaporanRow[] {
  const absensi = ctx.absensi.filter((a) => inCtxPeriod(rowDate(a, 'tanggal'), ctx, now));
  const izin = ctx.izin.filter((i) => inCtxPeriod(rowDate(i, 'tanggal_keluar'), ctx, now));
  const bk = ctx.pembinaan.filter((p) => inCtxPeriod(rowDate(p, 'tanggal'), ctx, now));

  return [...ctx.santri]
    .map((s) => {
      const id = String(s.id ?? '');
      const nama = String(s.nama ?? 'Santri');
      const abs = absensi.filter((a) => String(a.santri_id) === id || String(a.santri_nama) === nama);
      const iz = izin.filter((i) => String(i.santri_id) === id || String(i.santri_nama) === nama);
      const pb = bk.filter((p) => String(p.santri_id) === id || String(p.santri_nama) === nama);
      let hadir = 0;
      let alpa = 0;
      for (const a of abs) {
        const st = String(a.status ?? '');
        if (st === 'Hadir') hadir += 1;
        if (st === 'Alpa') alpa += 1;
      }
      return {
        id,
        nama,
        kamar: String(s.kamar ?? '—'),
        kelas: String(s.kelas ?? '—'),
        absensi: abs.length,
        hadir,
        alpa,
        izinCount: iz.length,
        bkCount: pb.length,
        poin: Number(s.jumlah_pelanggaran ?? 0),
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

export function buildPerSantriSummaryHtml(ctx: LaporanContext, now = new Date()): string {
  const rows = computePerSantriRows(ctx, now);
  const tableRows = rows.map((s, idx) => [
    idx + 1,
    s.nama,
    s.kelas,
    s.kamar,
    s.bkCount,
    s.poin,
  ]);
  return [
    h3('Ringkasan semua santri (periode)'),
    htmlTable(
      ['No', 'Nama', 'Kelas', 'Kamar', 'Pelanggaran/Pembinaan', 'Jumlah pelanggaran'],
      tableRows,
      'Belum ada data santri'
    ),
  ].join('');
}

/** Detail satu santri: profil + tabel BK periode. */
export function buildSingleSantriHtml(
  ctx: LaporanContext,
  santriId: string,
  now = new Date()
): string {
  const s =
    ctx.santri.find((x) => String(x.id) === santriId) ??
    ctx.santri.find((x) => String(x.nama) === santriId);
  if (!s) return `<p class="empty">Santri tidak ditemukan.</p>`;

  const id = String(s.id ?? '');
  const nama = String(s.nama ?? 'Santri');
  const bk = ctx.pembinaan.filter(
    (p) =>
      inCtxPeriod(rowDate(p, 'tanggal'), ctx, now) &&
      (String(p.santri_id) === id || String(p.santri_nama) === nama)
  );

  const asal = hasAsalWilayah(s as SantriAsalWilayahFields)
    ? formatAsalWilayah(s as SantriAsalWilayahFields)
    : '—';

  return [
    kvTable([
      ['Nama', nama],
      ['Kelas', String(s.kelas ?? '—')],
      ['Kamar', String(s.kamar ?? '—')],
      ['Asal', asal],
      ['Jumlah pelanggaran', Number(s.jumlah_pelanggaran ?? 0)],
    ]),
    h3(`Pelanggaran/Pembinaan (${bk.length})`),
    htmlTable(
      ['Tanggal', 'Jenis', 'Keterangan', 'Tindak lanjut'],
      bk.map((p) => [
        fmtShortDate(rowDate(p, 'tanggal')),
        String(p.jenis ?? '—'),
        String(p.keterangan ?? '—'),
        String(p.tindak_lanjut ?? '—'),
      ]),
      'Tidak ada catatan pelanggaran/pembinaan pada periode'
    ),
  ].join('');
}

/** Detail semua santri yang punya aktivitas di periode (untuk paket penuh). */
export function buildPerSantriDetailHtml(ctx: LaporanContext, now = new Date()): string {
  const rows = computePerSantriRows(ctx, now).filter(
    (s) => s.bkCount > 0 || s.poin > 0
  );
  if (!rows.length) {
    return `${buildPerSantriSummaryHtml(ctx, now)}<p class="empty">Tidak ada catatan pelanggaran/pembinaan per santri pada periode ini.</p>`;
  }

  const details = rows
    .map((s) => {
      const body = buildSingleSantriHtml(ctx, s.id, now);
      return `<div class="santri-block"><h4>${escapeHtml(s.nama)}</h4><p class="santri-meta">${escapeHtml(s.kelas)} · Kamar ${escapeHtml(s.kamar)}</p>${body}</div>`;
    })
    .join('');

  return [buildPerSantriSummaryHtml(ctx, now), h3('Detail santri beraktivitas'), details].join('');
}

export function buildReportSectionHtml(
  id: LaporanReportId | 'persantri',
  ctx: LaporanContext,
  now = new Date()
): string {
  switch (id) {
    case 'harian':
      return buildHarianHtml(ctx, now);
    case 'absensi':
      return buildAbsensiHtml(ctx, now);
    case 'izin':
      return buildIzinHtml(ctx, now);
    case 'pembinaan':
      return buildPembinaanHtml(ctx, now);
    case 'kamar':
      return buildKamarHtml(ctx);
    case 'kelas':
      return buildKelasHtml(ctx);
    case 'pelanggaran':
      return buildPelanggaranHtml(ctx);
    case 'wilayah':
      return buildWilayahHtml(ctx);
    case 'persantri':
      return buildPerSantriDetailHtml(ctx, now);
    default:
      return '';
  }
}

export const LAPORAN_TABLE_BUNDLE_IDS: Array<LaporanReportId | 'persantri'> = [
  'harian',
  // Sementara disembunyikan: absensi, izin, kamar, wilayah
  'pembinaan',
  'kelas',
  'pelanggaran',
  'persantri',
];

export const LAPORAN_TABLE_SECTION_TITLES: Record<LaporanReportId | 'persantri', string> = {
  harian: 'Laporan Harian',
  absensi: 'Rekap Absensi',
  izin: 'Rekap Perizinan',
  pembinaan: 'Rekap Pelanggaran/Pembinaan',
  kamar: 'Rekap Hunian Kamar',
  kelas: 'Rekap Santri per Kelas',
  pelanggaran: 'Peringkat Pelanggaran',
  wilayah: 'Sebaran Asal Wilayah',
  persantri: 'Laporan per Santri',
};

export function buildLaporanTablesDocumentHtml(
  ctx: LaporanContext,
  now = new Date(),
  opts?: { title?: string; ids?: Array<LaporanReportId | 'persantri'> }
): string {
  const periode = periodLabel(ctx.period, ctx.customRange);
  const generatedAt = format(now, "EEEE, d MMMM yyyy HH:mm", { locale: localeId });
  const ids = opts?.ids ?? LAPORAN_TABLE_BUNDLE_IDS;
  const docTitle = opts?.title ?? 'Paket laporan lengkap (tabel)';

  const sections = ids
    .map((id) => {
      const subtitle =
        id === 'harian' || id === 'kamar' || id === 'kelas' || id === 'pelanggaran'
          ? ''
          : `Periode: ${periode}`;
      return section(LAPORAN_TABLE_SECTION_TITLES[id], buildReportSectionHtml(id, ctx, now), subtitle);
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Laporan ${escapeHtml(ctx.namaAsrama)}</title>
  <style>${LAPORAN_PRINT_CSS}</style>
</head>
<body>
  <header class="doc-header">
    <h1>${escapeHtml(ctx.namaAsrama)}</h1>
    <p class="meta">
      <strong>${escapeHtml(docTitle)}</strong><br />
      Periode rekap: ${escapeHtml(periode)} · Tanggal laporan: ${escapeHtml(fmtLongDate(now))}<br />
      Dicetak: ${escapeHtml(generatedAt)}
    </p>
  </header>
  ${sections}
  <footer class="doc-footer">
    Dokumen tabel laporan asrama — simpan sebagai PDF bila perlu.
  </footer>
</body>
</html>`;
}

export function buildSingleSantriDocumentHtml(
  ctx: LaporanContext,
  santriId: string,
  now = new Date()
): string {
  const s =
    ctx.santri.find((x) => String(x.id) === santriId) ??
    ctx.santri.find((x) => String(x.nama) === santriId);
  const nama = String(s?.nama ?? 'Santri');
  const periode = periodLabel(ctx.period, ctx.customRange);
  const generatedAt = format(now, "EEEE, d MMMM yyyy HH:mm", { locale: localeId });
  const body = buildSingleSantriHtml(ctx, santriId, now);

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Laporan ${escapeHtml(nama)} — ${escapeHtml(ctx.namaAsrama)}</title>
  <style>${LAPORAN_PRINT_CSS}</style>
</head>
<body>
  <header class="doc-header">
    <h1>${escapeHtml(ctx.namaAsrama)}</h1>
    <p class="meta">
      <strong>Laporan per santri: ${escapeHtml(nama)}</strong><br />
      Periode: ${escapeHtml(periode)}<br />
      Dicetak: ${escapeHtml(generatedAt)}
    </p>
  </header>
  <section class="report-section">
    <h2>Data &amp; aktivitas</h2>
    ${body}
  </section>
  <footer class="doc-footer">Laporan individual santri</footer>
</body>
</html>`;
}
