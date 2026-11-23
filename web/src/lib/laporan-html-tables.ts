/**
 * Builder HTML laporan berbentuk tabel (untuk unduh PDF/HTML).
 * Format WhatsApp tetap di laporan-reports.ts (untuk kirim WA).
 */
import { format, parse } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { formatIzinBatasKembali } from '@/lib/izin-group';
import { pembinaanJenisLabel } from '@/lib/pembinaan-group';
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
  computePelanggaranPeriodRanks,
  computePembayaranRekap,
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

/**
 * Parse tanggal aman timezone:
 * - `yyyy-MM-dd` / midnight UTC → hari kalender lokal (hindari geser -1 hari)
 * - datetime penuh → Date biasa
 */
function parseAppDate(iso: string): Date | null {
  const raw = String(iso ?? '').trim();
  if (!raw) return null;
  const datePart = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const rest = raw.slice(10).trim();
  const isCalendarDay =
    !rest ||
    rest === 'T00:00:00.000Z' ||
    rest === 'T00:00:00Z' ||
    /^T00:00:00(\.0+)?(Z|[+-]00:00)?$/i.test(rest) ||
    (!rest.includes('T') && !rest.includes(':'));
  if (isCalendarDay) {
    const [y, m, d] = datePart.split('-').map(Number);
    const local = new Date(y, m - 1, d);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateSortKey(iso: string): number {
  return parseAppDate(iso)?.getTime() ?? 0;
}

// Laporan selalu mencakup seluruh riwayat — tidak ada filter tanggal.
function inCtxPeriod(_iso: string, _ctx: LaporanContext, _now: Date): boolean {
  return true;
}

function fmtLongDate(d = new Date()) {
  return format(d, 'EEEE, d MMMM yyyy', { locale: localeId });
}

function fmtShortDateTime(iso: string) {
  const d = parseAppDate(iso);
  if (!d) return iso?.trim() ? iso : '—';
  // Kalau sumbernya hanya tanggal kalender, jangan tampilkan jam palsu 07:00.
  const raw = String(iso ?? '').trim();
  const rest = raw.slice(10).trim();
  const dateOnly =
    /^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10)) &&
    (!rest ||
      rest === 'T00:00:00.000Z' ||
      rest === 'T00:00:00Z' ||
      /^T00:00:00(\.0+)?(Z|[+-]00:00)?$/i.test(rest));
  if (dateOnly) return format(d, 'd MMM yyyy', { locale: localeId });
  return format(d, 'd MMM yyyy HH:mm', { locale: localeId });
}

function fmtShortDate(iso: string) {
  const d = parseAppDate(iso);
  if (!d) return iso?.trim() ? iso : '—';
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

function isSingleSantriCtx(ctx: LaporanContext): boolean {
  return ctx.santri.length === 1;
}

function resolveSantriLabel(
  ctx: LaporanContext,
  santriId: string,
  fallbackNama: string
): { nama: string; kamar: string; kelas: string } {
  const s =
    ctx.santri.find((x) => String(x.id) === santriId) ??
    ctx.santri.find((x) => String(x.nama) === fallbackNama);
  return {
    nama: String(s?.nama ?? (fallbackNama || '—')),
    kamar: String(s?.kamar ?? '—'),
    kelas: String(s?.kelas ?? '—'),
  };
}

/** Akumulasi izin per santri (1 baris = 1 orang). */
function buildIzinPerSantriSummary(ctx: LaporanContext, rows: EntityRow[]): string {
  type Acc = { id: string; nama: string; kamar: string; total: number; belum: number; sudah: number };
  const map = new Map<string, Acc>();
  for (const i of rows) {
    const id = String(i.santri_id ?? i.santri_nama ?? '');
    const namaRaw = String(i.santri_nama ?? '—');
    const key = id || namaRaw;
    const label = resolveSantriLabel(ctx, String(i.santri_id ?? ''), namaRaw);
    const cur = map.get(key) ?? {
      id: key,
      nama: label.nama,
      kamar: label.kamar !== '—' ? label.kamar : String(i.santri_kamar ?? '—'),
      total: 0,
      belum: 0,
      sudah: 0,
    };
    cur.total += 1;
    if (i.status_kembali === 'Belum') cur.belum += 1;
    else cur.sudah += 1;
    map.set(key, cur);
  }
  const ranked = [...map.values()].sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama, 'id'));
  return htmlTable(
    ['No', 'Nama', 'Kamar', 'Total izin', 'Belum kembali', 'Sudah kembali'],
    ranked.map((r, idx) => [idx + 1, r.nama, r.kamar, r.total, r.belum, r.sudah]),
    'Tidak ada catatan izin'
  );
}

/** Akumulasi pelanggaran per santri (1 baris = 1 orang). */
function buildBkPerSantriSummary(ctx: LaporanContext, rows: EntityRow[]): string {
  type Acc = {
    id: string;
    nama: string;
    kamar: string;
    total: number;
    poin: number;
  };
  const map = new Map<string, Acc>();
  for (const p of rows) {
    const id = String(p.santri_id ?? p.santri_nama ?? '');
    const namaRaw = String(p.santri_nama ?? '—');
    const key = id || namaRaw;
    const label = resolveSantriLabel(ctx, String(p.santri_id ?? ''), namaRaw);
    const s = ctx.santri.find((x) => String(x.id) === String(p.santri_id ?? '')) ??
      ctx.santri.find((x) => String(x.nama) === namaRaw);
    const cur = map.get(key) ?? {
      id: key,
      nama: label.nama,
      kamar: label.kamar !== '—' ? label.kamar : String(p.santri_kamar ?? '—'),
      total: 0,
      poin: Number(s?.jumlah_pelanggaran ?? 0),
    };
    cur.total += 1;
    map.set(key, cur);
  }
  const ranked = [...map.values()].sort(
    (a, b) => b.total - a.total || a.nama.localeCompare(b.nama, 'id')
  );
  return htmlTable(
    ['No', 'Nama', 'Kamar', 'Jumlah catatan', 'Akumulasi poin'],
    ranked.map((r, idx) => [idx + 1, r.nama, r.kamar, r.total, r.poin]),
    'Belum ada catatan'
  );
}

function buildIzinHtml(ctx: LaporanContext, now: Date): string {
  const rows = ctx.izin
    .filter((i) => inCtxPeriod(rowDate(i, 'tanggal_keluar'), ctx, now))
    .sort(
      (a, b) =>
        dateSortKey(rowDate(b, 'tanggal_keluar')) - dateSortKey(rowDate(a, 'tanggal_keluar'))
    );
  const belum = rows.filter((i) => i.status_kembali === 'Belum').length;
  const sudah = rows.filter((i) => i.status_kembali === 'Sudah').length;
  const single = isSingleSantriCtx(ctx);
  const namaSatu = single ? String(ctx.santri[0]?.nama ?? 'Santri') : '';

  // Satu santri → semua baris izinnya. Semua santri → akumulasi dulu, lalu rincian.
  const detailHeaders = single
    ? ['No', 'Status', 'Keluar', 'Batas', 'Alasan', 'Penjemput']
    : ['No', 'Nama', 'Kamar', 'Status', 'Keluar', 'Batas', 'Alasan', 'Penjemput'];
  const detailRows = rows.map((i, idx) => {
    const status = i.status_kembali === 'Belum' ? 'Belum kembali' : 'Sudah kembali';
    const common = [
      status,
      fmtShortDateTime(rowDate(i, 'tanggal_keluar')),
      formatIzinBatasKembali(rowDate(i, 'batas_kembali')),
      String(i.alasan ?? '—'),
      String(i.penjemput ?? '—'),
    ];
    if (single) return [idx + 1, ...common];
    return [
      idx + 1,
      String(i.santri_nama ?? '—'),
      String(i.santri_kamar ?? '—'),
      ...common,
    ];
  });

  return [
    kvTable([
      ...(single ? [['Santri', namaSatu] as [string, string | number]] : []),
      ['Total izin', rows.length],
      ['Belum kembali', belum],
      ['Sudah kembali', sudah],
    ]),
    single
      ? ''
      : `${h3('Akumulasi per santri (1 baris = 1 orang)')}${buildIzinPerSantriSummary(ctx, rows)}`,
    h3(single ? `Semua izin ${namaSatu} (${rows.length})` : `Rincian setiap izin (${rows.length})`),
    htmlTable(detailHeaders, detailRows, 'Tidak ada catatan izin'),
  ].join('');
}

function buildPembinaanHtml(ctx: LaporanContext, now: Date): string {
  const rows = ctx.pembinaan
    .filter((p) => inCtxPeriod(rowDate(p, 'tanggal'), ctx, now))
    .sort((a, b) => dateSortKey(rowDate(b, 'tanggal')) - dateSortKey(rowDate(a, 'tanggal')));
  const summary = computeLaporanSummary(ctx, now);
  const jenisRows = Object.entries(summary.bkByJenis).map(([j, n]) => [
    pembinaanJenisLabel(j),
    n,
  ]);
  const single = isSingleSantriCtx(ctx);
  const namaSatu = single ? String(ctx.santri[0]?.nama ?? 'Santri') : '';
  const poinSatu = single ? Number(ctx.santri[0]?.jumlah_pelanggaran ?? 0) : 0;

  const detailHeaders = single
    ? ['No', 'Tanggal', 'Jenis', 'Keterangan', 'Tindak lanjut']
    : ['No', 'Nama', 'Kamar', 'Tanggal', 'Jenis', 'Keterangan', 'Tindak lanjut'];
  const detailRows = rows.map((p, idx) => {
    const common = [
      fmtShortDate(rowDate(p, 'tanggal')),
      pembinaanJenisLabel(String(p.jenis ?? '')),
      String(p.keterangan ?? '—'),
      String(p.tindak_lanjut ?? '—'),
    ];
    if (single) return [idx + 1, ...common];
    return [
      idx + 1,
      String(p.santri_nama ?? '—'),
      String(p.santri_kamar ?? '—'),
      ...common,
    ];
  });

  return [
    kvTable([
      ...(single
        ? [
            ['Santri', namaSatu] as [string, string | number],
            ['Akumulasi poin pelanggaran', poinSatu] as [string, string | number],
          ]
        : []),
      ['Total catatan pelanggaran', rows.length],
    ]),
    h3('Ringkasan jenis'),
    htmlTable(['Jenis', 'Jumlah'], jenisRows, 'Belum ada'),
    single
      ? ''
      : `${h3('Akumulasi per santri (1 baris = 1 orang)')}${buildBkPerSantriSummary(ctx, rows)}`,
    h3(
      single
        ? `Semua catatan pelanggaran ${namaSatu} (${rows.length})`
        : `Rincian setiap catatan (${rows.length})`
    ),
    htmlTable(
      detailHeaders,
      detailRows,
      'Belum ada catatan pelanggaran'
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

function formatRp(n: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

function buildPelanggaranHtml(ctx: LaporanContext, now: Date): string {
  const ranked = computePelanggaranPeriodRanks(ctx, now);
  const rows = ranked.map((s, idx) => [idx + 1, s.nama, s.kelas, s.kamar, s.count]);
  return htmlTable(
    ['Peringkat', 'Nama', 'Kelas', 'Kamar', 'Pelanggaran'],
    rows,
    'Belum ada catatan pelanggaran'
  );
}

function buildPembayaranHtml(ctx: LaporanContext): string {
  const rekap = computePembayaranRekap(ctx);
  const jenisRows = rekap.byJenis.map((j, idx) => [
    idx + 1,
    j.nama,
    j.jumlah,
    formatRp(j.nominal),
    formatRp(j.terbayar),
    formatRp(j.sisa),
  ]);
  const belumLunasRows = rekap.belumLunas.map((t, idx) => [
    idx + 1,
    t.nama,
    t.kelas,
    t.kamar,
    t.jumlahTagihan,
    formatRp(t.totalSisa),
  ]);
  const tunggakanRows = rekap.tunggakan.map((t, idx) => [
    idx + 1,
    t.nama,
    t.kelas,
    t.kamar,
    t.jumlahTagihan,
    formatRp(t.totalSisa),
  ]);

  return [
    kvTable([
      ['Total tagihan', rekap.totalTagihan],
      ['Nominal', formatRp(rekap.totalNominal)],
      ['Terbayar', formatRp(rekap.totalTerbayar)],
      ['Sisa total', formatRp(rekap.totalSisa)],
      ['Sisa dalam tempo', formatRp(rekap.totalSisaDalamTempo)],
      ['Sisa tunggakan (jatuh tempo)', formatRp(rekap.totalSisaTunggakan)],
      ['Belum', rekap.byStatus.belum],
      ['Sebagian', rekap.byStatus.sebagian],
      ['Lunas', rekap.byStatus.lunas],
    ]),
    h3('Per jenis tagihan'),
    htmlTable(
      ['No', 'Jenis', 'Jumlah', 'Nominal', 'Terbayar', 'Sisa'],
      jenisRows,
      'Belum ada tagihan'
    ),
    h3(`Belum lunas — masih dalam tempo (${rekap.belumLunas.length} santri)`),
    htmlTable(
      ['No', 'Nama', 'Kelas', 'Kamar', 'Tagihan', 'Sisa'],
      belumLunasRows,
      'Tidak ada tagihan belum lunas dalam tempo'
    ),
    h3(`Tunggakan — sudah jatuh tempo (${rekap.tunggakan.length} santri)`),
    htmlTable(
      ['No', 'Nama', 'Kelas', 'Kamar', 'Tagihan', 'Sisa'],
      tunggakanRows,
      'Tidak ada tunggakan / lewat jatuh tempo'
    ),
  ].join('');
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
  /** Catatan BK jenis Pelanggaran dalam periode. */
  pelanggaranPeriod: number;
  /** Akumulasi seumur hidup di profil santri. */
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
      let pelanggaranPeriod = 0;
      for (const a of abs) {
        const st = String(a.status ?? '');
        if (st === 'Hadir') hadir += 1;
        if (st === 'Alpa') alpa += 1;
      }
      for (const p of pb) {
        if (String(p.jenis) === 'Pelanggaran') pelanggaranPeriod += 1;
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
        pelanggaranPeriod,
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
    s.pelanggaranPeriod,
    s.poin,
  ]);
  return [
    h3('Ringkasan semua santri'),
    htmlTable(
      ['No', 'Nama', 'Kelas', 'Kamar', 'Pelanggaran', 'Akumulasi'],
      tableRows,
      'Belum ada data santri'
    ),
  ].join('');
}

function matchSantriRow(row: EntityRow, id: string, nama: string): boolean {
  return String(row.santri_id ?? '') === id || String(row.santri_nama ?? '') === nama;
}

/** Detail satu santri — laporan lengkap: profil + absensi + izin + semua BK. */
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
  const match = (row: EntityRow) => matchSantriRow(row, id, nama);

  const absensi = ctx.absensi.filter(
    (a) => inCtxPeriod(rowDate(a, 'tanggal'), ctx, now) && match(a)
  );
  const izin = ctx.izin.filter(
    (i) => inCtxPeriod(rowDate(i, 'tanggal_keluar'), ctx, now) && match(i)
  );
  // BK: seluruh catatan (bukan hanya periode) agar laporan ke ortu lengkap.
  const bk = ctx.pembinaan
    .filter((p) => match(p))
    .sort((a, b) => dateSortKey(rowDate(b, 'tanggal')) - dateSortKey(rowDate(a, 'tanggal')));

  let hadir = 0;
  let alpa = 0;
  let sakit = 0;
  let izinAbs = 0;
  for (const a of absensi) {
    const st = String(a.status ?? '');
    if (st === 'Hadir') hadir += 1;
    else if (st === 'Alpa') alpa += 1;
    else if (st === 'Sakit') sakit += 1;
    else if (st === 'Izin') izinAbs += 1;
  }
  const asal = hasAsalWilayah(s as SantriAsalWilayahFields)
    ? formatAsalWilayah(s as SantriAsalWilayahFields)
    : '—';
  const periode = 'semua data';

  return [
    kvTable([
      ['Nama', nama],
      ['Kelas', String(s.kelas ?? '—')],
      ['Kamar', String(s.kamar ?? '—')],
      ['Asal', asal],
      ['Akumulasi pelanggaran', Number(s.jumlah_pelanggaran ?? 0)],
      ['Cakupan absensi/izin', periode],
    ]),
    h3(`Ringkasan absensi (${periode})`),
    kvTable([
      ['Total catatan', absensi.length],
      ['Hadir', hadir],
      ['Alpa', alpa],
      ['Sakit', sakit],
      ['Izin (absensi)', izinAbs],
    ]),
    h3(`Rincian absensi (${absensi.length})`),
    htmlTable(
      ['Tanggal', 'Kegiatan', 'Status'],
      absensi.map((a) => [
        fmtShortDate(rowDate(a, 'tanggal')),
        String(a.kegiatan_nama ?? a.kegiatan ?? '—'),
        String(a.status ?? '—'),
      ]),
      'Tidak ada catatan absensi'
    ),
    h3(`Perizinan (${izin.length}) — ${periode}`),
    htmlTable(
      ['Keluar', 'Batas', 'Status', 'Alasan', 'Penjemput'],
      izin.map((i) => [
        fmtShortDateTime(rowDate(i, 'tanggal_keluar')),
        formatIzinBatasKembali(rowDate(i, 'batas_kembali')),
        i.status_kembali === 'Belum' ? 'Belum kembali' : 'Sudah kembali',
        String(i.alasan ?? '—'),
        String(i.penjemput ?? '—'),
      ]),
      'Tidak ada catatan izin'
    ),
    h3(`Pelanggaran — seluruh catatan (${bk.length})`),
    kvTable([['Total catatan pelanggaran', bk.length]]),
    htmlTable(
      ['Tanggal', 'Jenis', 'Keterangan', 'Tindak lanjut'],
      bk.map((p) => [
        fmtShortDate(rowDate(p, 'tanggal')),
        pembinaanJenisLabel(String(p.jenis ?? '')),
        String(p.keterangan ?? '—'),
        String(p.tindak_lanjut ?? '—'),
      ]),
      'Belum ada catatan pelanggaran'
    ),
  ].join('');
}

/** Detail semua santri yang punya aktivitas di periode (untuk paket penuh). */
export function buildPerSantriDetailHtml(ctx: LaporanContext, now = new Date()): string {
  const rows = computePerSantriRows(ctx, now).filter(
    (s) => s.bkCount > 0 || s.pelanggaranPeriod > 0 || s.poin > 0
  );
  if (!rows.length) {
    return `${buildPerSantriSummaryHtml(ctx, now)}<p class="empty">Tidak ada catatan pelanggaran per santri.</p>`;
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
      return buildPelanggaranHtml(ctx, now);
    case 'wilayah':
      return buildWilayahHtml(ctx);
    case 'pembayaran':
      return buildPembayaranHtml(ctx);
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
  pembinaan: 'Rekap Pelanggaran',
  kamar: 'Rekap Hunian Kamar',
  kelas: 'Rekap Santri per Kelas',
  pelanggaran: 'Peringkat Pelanggaran',
  wilayah: 'Sebaran Asal Wilayah',
  pembayaran: 'Rekap Pembayaran',
  persantri: 'Laporan per Santri',
};

export function buildLaporanTablesDocumentHtml(
  ctx: LaporanContext,
  now = new Date(),
  opts?: { title?: string; ids?: Array<LaporanReportId | 'persantri'> }
): string {
  const generatedAt = format(now, "EEEE, d MMMM yyyy HH:mm", { locale: localeId });
  const ids = opts?.ids ?? LAPORAN_TABLE_BUNDLE_IDS;
  const docTitle = opts?.title ?? 'Paket laporan lengkap (tabel)';

  const sections = ids
    .map((id) => {
      const subtitle =
        id === 'harian' || id === 'kamar' || id === 'kelas'
          ? ''
          : 'Cakupan: semua data';
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
      Cakupan: semua data · Tanggal laporan: ${escapeHtml(fmtLongDate(now))}<br />
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
      <strong>Laporan lengkap santri: ${escapeHtml(nama)}</strong><br />
      Absensi, izin &amp; pelanggaran: seluruh catatan<br />
      Dicetak: ${escapeHtml(generatedAt)}
    </p>
  </header>
  <section class="report-section">
    <h2>Profil, absensi, izin &amp; pelanggaran</h2>
    ${body}
  </section>
  <footer class="doc-footer">Laporan lengkap individual — cocok dibagikan ke orangtua/wali</footer>
</body>
</html>`;
}

/** Baris catatan pelanggaran untuk PDF ke orangtua. */
export type BkWaliRecord = {
  tanggal: string;
  jenis: string;
  keterangan?: string;
  tindak_lanjut?: string;
};

export type BkWaliSantriInfo = {
  nama: string;
  kelas?: string;
  kamar?: string;
  nomorWali?: string;
  poinAkumulasi?: number;
  tierLabel?: string | null;
};

/** PDF untuk orangtua: profil singkat + seluruh catatan pelanggaran. */
export function buildBkWaliDocumentHtml(opts: {
  namaAsrama: string;
  santri: BkWaliSantriInfo;
  records: BkWaliRecord[];
  now?: Date;
}): string {
  const now = opts.now ?? new Date();
  const generatedAt = format(now, "EEEE, d MMMM yyyy HH:mm", { locale: localeId });
  const nama = opts.santri.nama.trim() || 'Santri';
  const sorted = [...opts.records].sort(
    (a, b) => dateSortKey(b.tanggal) - dateSortKey(a.tanggal)
  );
  const poin = opts.santri.poinAkumulasi ?? 0;
  const tier = opts.santri.tierLabel?.trim();

  const body = [
    kvTable([
      ['Nama', nama],
      ['Kelas', opts.santri.kelas?.trim() || '—'],
      ['Kamar', opts.santri.kamar?.trim() || '—'],
      ['Nomor wali', opts.santri.nomorWali?.trim() || '—'],
      ['Total catatan pelanggaran', sorted.length],
      ['Akumulasi pelanggaran', poin + (tier ? ` (${tier})` : '')],
    ]),
    h3(`Rincian catatan pelanggaran (${sorted.length})`),
    htmlTable(
      ['No', 'Tanggal', 'Jenis', 'Keterangan', 'Tindak lanjut'],
      sorted.map((r, idx) => [
        idx + 1,
        fmtShortDate(r.tanggal),
        pembinaanJenisLabel(r.jenis),
        r.keterangan?.trim() || '—',
        r.tindak_lanjut?.trim() || '—',
      ]),
      'Belum ada catatan pelanggaran'
    ),
  ].join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Laporan Pelanggaran ${escapeHtml(nama)} — ${escapeHtml(opts.namaAsrama)}</title>
  <style>${LAPORAN_PRINT_CSS}</style>
</head>
<body>
  <header class="doc-header">
    <h1>${escapeHtml(opts.namaAsrama)}</h1>
    <p class="meta">
      <strong>Laporan pelanggaran untuk orangtua/wali</strong><br />
      Santri: ${escapeHtml(nama)} · Seluruh catatan pelanggaran<br />
      Dicetak: ${escapeHtml(generatedAt)}
    </p>
  </header>
  <section class="report-section">
    <h2>Profil &amp; ringkasan pelanggaran</h2>
    ${body}
  </section>
  <footer class="doc-footer">
    Dokumen resmi catatan pelanggaran asrama — dibagikan kepada orangtua/wali sebagai PDF.
  </footer>
</body>
</html>`;
}

/** Baris tagihan belum lunas untuk PDF tunggakan ke orangtua. */
export type TunggakanWaliItem = {
  nama_jenis: string;
  periode: string;
  nominal: number;
  terbayar: number;
  sisa: number;
  status: string;
  jatuh_tempo?: string;
  lewat_tempo: boolean;
};

export type TunggakanWaliSantriInfo = {
  nama: string;
  kelas?: string;
  kamar?: string;
  nomorWali?: string;
};

const NAMA_BULAN_PDF = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function labelPeriodePdf(periode: string): string {
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (!m) return periode || '—';
  return `${NAMA_BULAN_PDF[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

function statusTagihanLabel(status: string): string {
  if (status === 'sebagian') return 'Sebagian';
  if (status === 'lunas') return 'Lunas';
  return 'Belum bayar';
}

/** PDF untuk orangtua: profil singkat + tagihan belum lunas / tunggakan. */
export function buildTunggakanWaliDocumentHtml(opts: {
  namaAsrama: string;
  santri: TunggakanWaliSantriInfo;
  items: TunggakanWaliItem[];
  now?: Date;
}): string {
  const now = opts.now ?? new Date();
  const generatedAt = format(now, "EEEE, d MMMM yyyy HH:mm", { locale: localeId });
  const nama = opts.santri.nama.trim() || 'Santri';
  const items = [...opts.items].sort((a, b) => {
    if (a.lewat_tempo !== b.lewat_tempo) return a.lewat_tempo ? -1 : 1;
    return `${b.periode}|${b.nama_jenis}`.localeCompare(`${a.periode}|${a.nama_jenis}`);
  });
  const totalSisa = items.reduce((acc, t) => acc + Math.max(0, t.sisa), 0);
  const lewatTempo = items.filter((t) => t.lewat_tempo).length;

  const body = [
    kvTable([
      ['Nama', nama],
      ['Kelas', opts.santri.kelas?.trim() || '—'],
      ['Kamar', opts.santri.kamar?.trim() || '—'],
      ['Nomor wali', opts.santri.nomorWali?.trim() || '—'],
      ['Tagihan belum lunas', items.length],
      ['Lewat jatuh tempo', lewatTempo],
      ['Total sisa', formatRp(totalSisa)],
    ]),
    h3(`Rincian tagihan belum lunas (${items.length})`),
    htmlTable(
      ['No', 'Jenis', 'Periode', 'Nominal', 'Terbayar', 'Sisa', 'Jatuh tempo', 'Keterangan'],
      items.map((t, idx) => [
        idx + 1,
        t.nama_jenis || '—',
        labelPeriodePdf(t.periode),
        formatRp(t.nominal),
        formatRp(t.terbayar),
        formatRp(t.sisa),
        t.jatuh_tempo ? fmtShortDate(t.jatuh_tempo) : '—',
        t.lewat_tempo ? 'Lewat tempo' : statusTagihanLabel(t.status),
      ]),
      'Tidak ada tagihan belum lunas'
    ),
  ].join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Laporan Tunggakan ${escapeHtml(nama)} — ${escapeHtml(opts.namaAsrama)}</title>
  <style>${LAPORAN_PRINT_CSS}</style>
</head>
<body>
  <header class="doc-header">
    <h1>${escapeHtml(opts.namaAsrama)}</h1>
    <p class="meta">
      <strong>Laporan tunggakan / tagihan belum lunas untuk orangtua/wali</strong><br />
      Santri: ${escapeHtml(nama)} · Semua periode<br />
      Dicetak: ${escapeHtml(generatedAt)}
    </p>
  </header>
  <section class="report-section">
    <h2>Profil &amp; ringkasan tunggakan</h2>
    ${body}
  </section>
  <footer class="doc-footer">
    Dokumen resmi tagihan asrama — dibagikan kepada orangtua/wali sebagai PDF.
  </footer>
</body>
</html>`;
}
