import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  parse,
  startOfMonth,
  subDays,
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { DashboardStats, EntityRow } from '@/store/app-store';
import {
  aggregateSantriByKecamatan,
  aggregateSantriByKota,
  aggregateSantriByProvinsi,
} from '@/lib/wilayah-stats';
import type { SantriAsalWilayahFields, WilayahIndexProvince } from '@/lib/wilayah-types';
import { formatAsalWilayah, hasAsalWilayah } from '@/lib/wilayah-types';
import {
  compareKegiatanUrutan,
  filterKegiatanForAbsensiDate,
  type KegiatanSchedule,
} from '@/lib/kegiatan-schedule';
import { formatIzinBatasKembali, isIzinBatasBelumPasti } from '@/lib/izin-group';
import {
  formatAbsensiStatusCountsInline,
  formatAbsensiStatusCountsWa,
  waBlank,
  waBulletLine,
  waBundleCover,
  waBundleSectionSeparator,
  waEmptyState,
  waFooterNote,
  waLabelValue,
  waNumberedBlock,
  waReportHeader,
  waSectionTitle,
  waSubsection,
  WA_INDENT,
  WA_LINE,
} from '@/lib/laporan-wa-format';

export const ABSENSI_STATUS_ORDER = ['Hadir', 'Izin', 'Sakit', 'Alpa'] as const;

export type AbsensiStatusCounts = Record<string, number>;

export type AbsensiKegiatanRekap = {
  nama: string;
  /** Berapa hari dalam periode kegiatan ini masuk jadwal absensi */
  hariJadwal: number;
  counts: AbsensiStatusCounts;
  totalCatatan: number;
};

export type AbsensiHarianBaris = {
  dateKey: string;
  label: string;
  kegiatan: string;
  counts: AbsensiStatusCounts;
  totalCatatan: number;
};

export type LaporanPeriod = 'all' | 'today' | '7d' | '30d' | 'month' | 'custom';

export type LaporanCustomRange = {
  dari: string;
  sampai: string;
};

export type LaporanReportId =
  | 'harian'
  | 'absensi'
  | 'izin'
  | 'pembinaan'
  | 'kamar'
  | 'kelas'
  | 'pelanggaran'
  | 'wilayah'
  | 'pembayaran';

export type LaporanWilayahGeo = {
  code: string;
  name: string;
  lat: number;
  lng: number;
};

/** Opsi format teks WhatsApp saat membangun laporan. */
export type LaporanWaBuildOptions = {
  /** Untuk paket gabungan: hindari salam berulang di tiap bagian. */
  skipGreeting?: boolean;
};

export type LaporanContext = {
  namaAsrama: string;
  period: LaporanPeriod;
  /** Wajib jika period === 'custom' (YYYY-MM-DD) */
  customRange?: LaporanCustomRange;
  stats: DashboardStats | null;
  santri: EntityRow[];
  kamar: EntityRow[];
  absensi: EntityRow[];
  izin: EntityRow[];
  pembinaan: EntityRow[];
  /** Tagihan (periode bulan overlap rekap) — dari /api/pembayaran/tagihan */
  tagihan?: EntityRow[];
  /** Master kegiatan (untuk rekap absensi per agenda) */
  kegiatan?: KegiatanSchedule[];
  /** Koordinat provinsi untuk rekap sebaran (opsional) */
  wilayahProvinsiGeo?: LaporanWilayahGeo[];
};

export type LaporanTagihanStatus = 'belum' | 'sebagian' | 'lunas';

export type LaporanPembayaranSantriSisa = {
  santriId: string;
  nama: string;
  kelas: string;
  kamar: string;
  totalSisa: number;
  jumlahTagihan: number;
};

export type LaporanPembayaranRekap = {
  totalTagihan: number;
  totalNominal: number;
  totalTerbayar: number;
  totalSisa: number;
  /** Sisa dari tagihan belum lunas yang masih dalam tempo (belum jatuh tempo). */
  totalSisaDalamTempo: number;
  /** Sisa dari tagihan sudah lewat jatuh tempo. */
  totalSisaTunggakan: number;
  byStatus: Record<LaporanTagihanStatus, number>;
  byJenis: Array<{
    nama: string;
    jumlah: number;
    nominal: number;
    terbayar: number;
    sisa: number;
  }>;
  /** Belum lunas, masih dalam tempo (bukan tunggakan). */
  belumLunas: LaporanPembayaranSantriSisa[];
  /** Belum lunas + sudah lewat jatuh tempo. */
  tunggakan: LaporanPembayaranSantriSisa[];
};

export type LaporanPelanggaranRank = {
  santriId: string;
  nama: string;
  kelas: string;
  kamar: string;
  count: number;
};

export function periodLabel(period: LaporanPeriod, customRange?: LaporanCustomRange): string {
  if (period === 'custom') {
    return laporanRekapInterval('custom', customRange).label;
  }
  switch (period) {
    case 'all':
      return 'Semua data';
    case 'today':
      return 'Hari ini';
    case '7d':
      return '7 hari terakhir';
    case '30d':
      return '30 hari terakhir';
    case 'month':
      return 'Bulan ini';
    default:
      return 'Hari ini';
  }
}

export function periodInterval(period: Exclude<LaporanPeriod, 'custom'>, now = new Date()) {
  const end = endOfDay(now);
  switch (period) {
    case 'all':
      return { start: new Date(0), end, label: periodLabel(period) };
    case 'today':
      return { start: startOfDay(now), end, label: periodLabel(period) };
    case '7d':
      return { start: startOfDay(subDays(now, 6)), end, label: periodLabel(period) };
    case '30d':
      return { start: startOfDay(subDays(now, 29)), end, label: periodLabel(period) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now), label: periodLabel(period) };
  }
}

export function laporanRekapInterval(
  period: LaporanPeriod,
  customRange?: LaporanCustomRange,
  now = new Date()
) {
  if (period === 'custom' && customRange?.dari && customRange?.sampai) {
    const start = startOfDay(parse(customRange.dari, 'yyyy-MM-dd', new Date()));
    const end = endOfDay(parse(customRange.sampai, 'yyyy-MM-dd', new Date()));
    const label = `${format(start, 'd MMM yyyy', { locale: localeId })} – ${format(end, 'd MMM yyyy', { locale: localeId })}`;
    return { start, end, label };
  }
  if (period === 'custom') {
    return periodInterval('today', now);
  }
  return periodInterval(period, now);
}

export function laporanRekapToDateKeys(
  period: LaporanPeriod,
  customRange?: LaporanCustomRange,
  now = new Date()
) {
  const { start, end } = laporanRekapInterval(period, customRange, now);
  return {
    dari: format(start, 'yyyy-MM-dd'),
    sampai: format(end, 'yyyy-MM-dd'),
  };
}

function rowDate(row: EntityRow, field: string): string {
  const v = row[field];
  return typeof v === 'string' ? v : '';
}

// Laporan selalu mencakup seluruh riwayat — tidak ada filter tanggal.
function inCtxPeriod(_iso: string, _ctx: LaporanContext, _now = new Date()) {
  return true;
}

function fmtLongDate(d = new Date()) {
  return format(d, 'EEEE, d MMMM yyyy', { locale: localeId });
}

function fmtShortDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'd MMM yyyy HH:mm', { locale: localeId });
}

function fmtShortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'd MMM yyyy', { locale: localeId });
}

function laporanWaHeader(
  ctx: LaporanContext,
  badge: string,
  title: string,
  metaLines: string[],
  wa?: LaporanWaBuildOptions
) {
  return waReportHeader({
    badge,
    title,
    namaAsrama: ctx.namaAsrama,
    metaLines,
    includeGreeting: !wa?.skipGreeting,
  });
}

function absensiRowDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function emptyAbsensiStatusCounts(): AbsensiStatusCounts {
  const counts: AbsensiStatusCounts = {};
  for (const s of ABSENSI_STATUS_ORDER) counts[s] = 0;
  return counts;
}

function addAbsensiStatus(counts: AbsensiStatusCounts, status: string) {
  const st = String(status ?? '—').trim() || '—';
  counts[st] = (counts[st] ?? 0) + 1;
}

export function formatAbsensiStatusCounts(counts: AbsensiStatusCounts): string {
  return formatAbsensiStatusCountsInline(counts);
}

function dateKeysInCtx(ctx: LaporanContext, now = new Date()): string[] {
  const { start, end } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  return eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'));
}

function kegiatanMasterList(ctx: LaporanContext): KegiatanSchedule[] {
  const master = ctx.kegiatan ?? [];
  return [...master].sort(compareKegiatanUrutan);
}

/** Rekap absensi lengkap: semua kegiatan dalam periode + agregat status. */
export function computeAbsensiRekap(ctx: LaporanContext, now = new Date()) {
  const rows = ctx.absensi.filter((a) => inCtxPeriod(rowDate(a, 'tanggal'), ctx, now));
  const dateKeys = dateKeysInCtx(ctx, now);
  const master = kegiatanMasterList(ctx);

  const scheduledDaysByKegiatan = new Map<string, number>();
  const kegiatanOrder: string[] = [];
  const seenKegiatan = new Set<string>();

  for (const dateKey of dateKeys) {
    const agenda =
      master.length > 0
        ? filterKegiatanForAbsensiDate(master, dateKey)
        : [];
    for (const k of agenda) {
      if (!seenKegiatan.has(k.nama)) {
        seenKegiatan.add(k.nama);
        kegiatanOrder.push(k.nama);
      }
      scheduledDaysByKegiatan.set(k.nama, (scheduledDaysByKegiatan.get(k.nama) ?? 0) + 1);
    }
  }

  const countsByKegiatan = new Map<string, AbsensiStatusCounts>();
  const initKeg = (nama: string) => {
    if (!countsByKegiatan.has(nama)) countsByKegiatan.set(nama, emptyAbsensiStatusCounts());
  };

  for (const nama of kegiatanOrder) initKeg(nama);

  const harian: AbsensiHarianBaris[] = [];

  for (const a of rows) {
    const keg = String(a.kegiatan ?? '—').trim() || '—';
    const dk = absensiRowDateKey(rowDate(a, 'tanggal'));
    if (!seenKegiatan.has(keg)) {
      seenKegiatan.add(keg);
      kegiatanOrder.push(keg);
    }
    initKeg(keg);
    addAbsensiStatus(countsByKegiatan.get(keg)!, String(a.status ?? '—'));

    const dayLabel = format(parse(dk, 'yyyy-MM-dd', new Date()), 'EEEE, d MMM yyyy', {
      locale: localeId,
    });
    let dayRow = harian.find((h) => h.dateKey === dk && h.kegiatan === keg);
    if (!dayRow) {
      dayRow = {
        dateKey: dk,
        label: dayLabel,
        kegiatan: keg,
        counts: emptyAbsensiStatusCounts(),
        totalCatatan: 0,
      };
      harian.push(dayRow);
    }
    addAbsensiStatus(dayRow.counts, String(a.status ?? '—'));
    dayRow.totalCatatan += 1;
  }

  harian.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.kegiatan.localeCompare(b.kegiatan, 'id'));

  const perKegiatan: AbsensiKegiatanRekap[] = kegiatanOrder.map((nama) => {
    const counts = countsByKegiatan.get(nama) ?? emptyAbsensiStatusCounts();
    const totalCatatan = Object.values(counts).reduce((s, n) => s + n, 0);
    return {
      nama,
      hariJadwal: scheduledDaysByKegiatan.get(nama) ?? 0,
      counts,
      totalCatatan,
    };
  });

  const totalByStatus = emptyAbsensiStatusCounts();
  for (const a of rows) addAbsensiStatus(totalByStatus, String(a.status ?? '—'));

  return {
    totalCatatan: rows.length,
    totalByStatus,
    perKegiatan,
    harian,
    dateKeys,
  };
}

export function computeLaporanSummary(ctx: LaporanContext, now = new Date()) {
  const totalSantri = ctx.stats?.totalSantri ?? ctx.santri.length;
  const activeIzin = ctx.izin.filter((i) => i.status_kembali === 'Belum');
  const diAsrama = Math.max(0, totalSantri - activeIzin.length);

  const absensiPeriod = ctx.absensi.filter((a) => inCtxPeriod(rowDate(a, 'tanggal'), ctx, now));
  const izinPeriod = ctx.izin.filter((i) => inCtxPeriod(rowDate(i, 'tanggal_keluar'), ctx, now));
  const bkPeriod = ctx.pembinaan.filter((p) => inCtxPeriod(rowDate(p, 'tanggal'), ctx, now));

  const absensiRekap = computeAbsensiRekap(ctx, now);
  const absensiByStatus = absensiRekap.totalByStatus;
  const absensiByKegiatan = absensiRekap.perKegiatan;

  const bkByJenis: Record<string, number> = {};
  for (const p of bkPeriod) {
    const j = String(p.jenis ?? '—');
    bkByJenis[j] = (bkByJenis[j] ?? 0) + 1;
  }

  const overdueIzin = activeIzin.filter((i) => {
    const raw = rowDate(i, 'batas_kembali');
    if (isIzinBatasBelumPasti(raw)) return false;
    const batas = new Date(raw);
    return !Number.isNaN(batas.getTime()) && batas < now;
  });

  const kapasitas = ctx.stats?.totalKapasitas ?? ctx.kamar.reduce((acc, k) => acc + Number(k.kapasitas ?? 0), 0);
  const terisi = ctx.stats?.totalTerisi ?? ctx.santri.length;
  const sisa = ctx.stats?.sisaRanjang ?? Math.max(0, kapasitas - terisi);

  return {
    totalSantri,
    diAsrama,
    activeIzinCount: activeIzin.length,
    absensiPeriodCount: absensiPeriod.length,
    izinPeriodCount: izinPeriod.length,
    bkPeriodCount: bkPeriod.length,
    absensiByStatus,
    absensiByKegiatan,
    bkByJenis,
    overdueIzin,
    kapasitas,
    terisi,
    sisa,
    hadirTerakhir: ctx.stats?.hadirTerakhir ?? 0,
    kegiatanTerakhir: ctx.stats?.kegiatanTerakhir ?? '—',
  };
}

export function buildLaporanHarian(
  ctx: LaporanContext,
  now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  const summary = computeLaporanSummary(ctx, now);
  const activeIzin = ctx.izin.filter((i) => i.status_kembali === 'Belum');
  const listIzinText =
    activeIzin.length > 0
      ? activeIzin
          .map((i, idx) =>
            waNumberedBlock(
              idx + 1,
              `*${String(i.santri_nama ?? 'Santri')}*`,
              [
                `Alasan: ${String(i.alasan ?? '-')}`,
                `Batas kembali: *${formatIzinBatasKembali(rowDate(i, 'batas_kembali'))}*`,
              ]
            )
          )
          .join('\n\n')
      : waEmptyState('(Tidak ada — semua di asrama)');

  const overdueBlock =
    summary.overdueIzin.length > 0
      ? [
          waSubsection(`⚠️ Izin lewat batas (${summary.overdueIzin.length})`),
          summary.overdueIzin
            .map((i, idx) =>
              waNumberedBlock(
                idx + 1,
                `*${String(i.santri_nama)}*`,
                [
                  `Seharusnya kembali: *${formatIzinBatasKembali(rowDate(i, 'batas_kembali'))}*`,
                ]
              )
            )
            .join('\n\n'),
        ].join('\n')
      : '';

  const header = laporanWaHeader(ctx, '📋', 'LAPORAN HARIAN', [
    `📅 ${fmtLongDate(now)}`,
    `👤 Pengurus ${ctx.namaAsrama}`,
  ], wa);

  return [
    header,
    waBlank(),
    waSectionTitle('1. Rekap kondisi santri'),
    waLabelValue('Total santri', `${summary.totalSantri} orang`),
    waLabelValue('Hadir di asrama', `${summary.diAsrama} orang`),
    waLabelValue('Sedang izin / di luar', `${summary.activeIzinCount} orang`),
    waSubsection('2. Hunian kamar'),
    waLabelValue('Kapasitas slot jiwa', String(summary.kapasitas)),
    waLabelValue('Terisi', String(summary.terisi)),
    waLabelValue('Sisa slot', String(summary.sisa)),
    waSubsection('3. Daftar santri sedang izin'),
    listIzinText,
    overdueBlock,
    waSubsection('4. Kegiatan terakhir'),
    waLabelValue('Agenda', String(summary.kegiatanTerakhir)),
    waLabelValue('Kehadiran', `${summary.hadirTerakhir} santri`),
    waFooterNote(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildRekapAbsensi(
  ctx: LaporanContext,
  now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  const { label } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const rekap = computeAbsensiRekap(ctx, now);
  const totalSantri = ctx.stats?.totalSantri ?? ctx.santri.length;

  const statusLines = formatAbsensiStatusCountsWa(rekap.totalByStatus);

  const kegiatanLines =
    rekap.perKegiatan.length > 0
      ? rekap.perKegiatan
          .map((k, idx) => {
            const jadwal =
              k.hariJadwal > 0
                ? `${k.hariJadwal} hari jadwal dalam periode`
                : 'Tidak ada di jadwal (data lama / nama lain)';
            const detail = formatAbsensiStatusCountsWa(k.counts);
            const kosong = k.totalCatatan === 0 ? ['_Belum ada catatan_'] : [];
            return waNumberedBlock(idx + 1, `*${k.nama}*`, [
              jadwal,
              `Total catatan: *${k.totalCatatan}*`,
              ...kosong,
              detail,
            ]);
          })
          .join('\n\n')
      : waEmptyState(
          '(Belum ada kegiatan absensi di master — atur di Kelola Data → Kegiatan)'
        );

  const showHarianDetail = rekap.dateKeys.length <= 14;
  let harianBlock = '';
  if (showHarianDetail && rekap.harian.length > 0) {
    const byDate = new Map<string, AbsensiHarianBaris[]>();
    for (const h of rekap.harian) {
      const list = byDate.get(h.dateKey) ?? [];
      list.push(h);
      byDate.set(h.dateKey, list);
    }
    const dayLines: string[] = [];
    for (const dk of rekap.dateKeys) {
      const bars = byDate.get(dk);
      if (!bars?.length) continue;
      const labelHari = bars[0]!.label;
      const kegLines = bars
        .map(
          (b) =>
            `${WA_INDENT}▸ *${b.kegiatan}* (${b.totalCatatan} catatan)\n${formatAbsensiStatusCountsWa(b.counts)}`
        )
        .join('\n\n');
      dayLines.push(`📅 *${labelHari}*\n${kegLines}`);
    }
    if (dayLines.length > 0) {
      harianBlock = `${waSubsection('Rincian per hari & kegiatan')}\n${dayLines.join('\n\n')}`;
    }
  } else if (!showHarianDetail && rekap.perKegiatan.length > 0) {
    harianBlock = `\n\n${WA_INDENT}_(Periode > 14 hari — rincian harian tidak ditampilkan; lihat agregat per kegiatan.)_`;
  }

  const header = laporanWaHeader(ctx, '📊', 'REKAP ABSENSI', [
    `📆 Periode: *${label}*`,
    `👥 Santri terdaftar: *${totalSantri}*`,
    `📝 Total catatan: *${rekap.totalCatatan}*`,
  ], wa);

  return [
    header,
    waBlank(),
    waSectionTitle('Ringkasan semua kegiatan'),
    statusLines || waEmptyState('(Belum ada catatan)'),
    waSubsection('Rekap per kegiatan (semua agenda)'),
    kegiatanLines,
    harianBlock,
    waFooterNote(),
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildRekapIzin(ctx: LaporanContext, now = new Date(), wa?: LaporanWaBuildOptions) {
  const { label } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const rows = ctx.izin.filter((i) => inCtxPeriod(rowDate(i, 'tanggal_keluar'), ctx, now));
  const belum = rows.filter((i) => i.status_kembali === 'Belum');
  const sudah = rows.filter((i) => i.status_kembali === 'Sudah');
  const single = ctx.santri.length === 1;
  const namaSatu = single ? String(ctx.santri[0]?.nama ?? 'Santri') : '';

  // Semua santri: ringkas akumulasi per orang dulu.
  let perSantriBlock = '';
  if (!single && rows.length > 0) {
    const map = new Map<string, { nama: string; total: number; belum: number }>();
    for (const i of rows) {
      const key = String(i.santri_id ?? i.santri_nama ?? '');
      const nama = String(i.santri_nama ?? '—');
      const cur = map.get(key) ?? { nama, total: 0, belum: 0 };
      cur.total += 1;
      if (i.status_kembali === 'Belum') cur.belum += 1;
      map.set(key, cur);
    }
    const lines = [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map((r, idx) =>
        waBulletLine(`${idx + 1}. *${r.nama}* — ${r.total} izin (${r.belum} belum kembali)`)
      )
      .join('\n');
    perSantriBlock = [waSectionTitle('Akumulasi per santri'), lines, waBlank()].join('\n');
  }

  const detail =
    rows.length > 0
      ? rows
          .map((i, idx) => {
            const st = i.status_kembali === 'Belum' ? '⏳ Belum kembali' : '✅ Sudah kembali';
            const title = single
              ? `Izin #${idx + 1}`
              : `*${String(i.santri_nama)}* · Kamar ${String(i.santri_kamar ?? '-')}`;
            return waNumberedBlock(idx + 1, title, [
              `Status: ${st}`,
              `Keluar: ${fmtShortDateTime(rowDate(i, 'tanggal_keluar'))}`,
              `Batas: *${formatIzinBatasKembali(rowDate(i, 'batas_kembali'))}*`,
              `Alasan: ${String(i.alasan ?? '-')}`,
              `Penjemput: ${String(i.penjemput ?? '-')}`,
            ]);
          })
          .join('\n\n')
      : waEmptyState('(Tidak ada izin pada periode ini)');

  const header = laporanWaHeader(ctx, '🚪', 'REKAP PERIZINAN', [
    `📆 Periode: *${label}*`,
    ...(single ? [`👤 Santri: *${namaSatu}*`] : []),
    `📋 Total izin: *${rows.length}*`,
    `⏳ Belum kembali: *${belum.length}* · ✅ Sudah: *${sudah.length}*`,
  ], wa);

  return [
    header,
    waBlank(),
    perSantriBlock,
    waSectionTitle(single ? `Semua izin ${namaSatu}` : 'Rincian setiap izin'),
    detail,
    waFooterNote(),
  ].join('\n');
}

export function buildRekapPembinaan(
  ctx: LaporanContext,
  now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  const { label } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const rows = ctx.pembinaan.filter((p) => inCtxPeriod(rowDate(p, 'tanggal'), ctx, now));
  const single = ctx.santri.length === 1;
  const namaSatu = single ? String(ctx.santri[0]?.nama ?? 'Santri') : '';
  const poinSatu = single ? Number(ctx.santri[0]?.jumlah_pelanggaran ?? 0) : 0;

  const jenisLines =
    rows.length > 0 ? waBulletLine(`Pelanggaran: *${rows.length}*`) : '';

  let perSantriBlock = '';
  if (!single && rows.length > 0) {
    const map = new Map<string, { nama: string; total: number }>();
    for (const p of rows) {
      const key = String(p.santri_id ?? p.santri_nama ?? '');
      const nama = String(p.santri_nama ?? '—');
      const cur = map.get(key) ?? { nama, total: 0 };
      cur.total += 1;
      map.set(key, cur);
    }
    const lines = [...map.values()]
      .sort((a, b) => b.total - a.total)
      .map((r, idx) =>
        waBulletLine(`${idx + 1}. *${r.nama}* — ${r.total} catatan pelanggaran`)
      )
      .join('\n');
    perSantriBlock = [waSectionTitle('Akumulasi per santri'), lines, waBlank()].join('\n');
  }

  const detail =
    rows.length > 0
      ? rows
          .map((p, idx) => {
            const lines = [
              `Jenis: *Pelanggaran* · ${fmtShortDate(rowDate(p, 'tanggal'))}`,
              `Keterangan: ${String(p.keterangan ?? '-')}`,
            ];
            if (p.tindak_lanjut) {
              lines.push(`Tindak lanjut: ${String(p.tindak_lanjut)}`);
            }
            const title = single
              ? `Pelanggaran #${idx + 1}`
              : `*${String(p.santri_nama)}* · Kamar ${String(p.santri_kamar ?? '-')}`;
            return waNumberedBlock(idx + 1, title, lines);
          })
          .join('\n\n')
      : waEmptyState('(Belum ada catatan pelanggaran pada periode ini)');

  const header = laporanWaHeader(ctx, '🛡️', 'REKAP PELANGGARAN', [
    `📆 Periode: *${label}*`,
    ...(single
      ? [`👤 Santri: *${namaSatu}*`, `📌 Akumulasi poin: *${poinSatu}*`]
      : []),
    `📝 Total catatan: *${rows.length}*`,
  ], wa);

  return [
    header,
    waBlank(),
    waSectionTitle('Ringkasan jenis'),
    jenisLines || waEmptyState('(Belum ada)'),
    waBlank(),
    perSantriBlock,
    waSubsection(single ? `Semua catatan pelanggaran ${namaSatu}` : 'Rincian setiap catatan'),
    detail,
    waFooterNote(),
  ].join('\n');
}

export function buildRekapKamar(ctx: LaporanContext, _now = new Date(), wa?: LaporanWaBuildOptions) {
  const summary = computeLaporanSummary(ctx);
  const lines =
    ctx.kamar.length > 0
      ? ctx.kamar
          .map((k, idx) => {
            const nama = String(k.nama ?? `Kamar ${idx + 1}`);
            const kap = Number(k.kapasitas ?? 0);
            const list = (k.santriList as { nama?: string }[] | undefined) ?? [];
            const terisi = list.length || ctx.santri.filter((s) => s.kamar === nama).length;
            const detail = [`Terisi: *${terisi}/${kap}* slot`];
            if (k.ketua) detail.push(`Ketua: ${k.ketua}`);
            return waNumberedBlock(idx + 1, `*${nama}*`, detail);
          })
          .join('\n\n')
      : waEmptyState('(Belum ada data kamar)');

  const header = laporanWaHeader(ctx, '🛏️', 'REKAP HUNIAN KAMAR', [
    `Kapasitas: *${summary.kapasitas}* · Terisi: *${summary.terisi}* · Sisa: *${summary.sisa}*`,
  ], wa);

  return [header, waBlank(), waSectionTitle('Per kamar'), lines, waFooterNote()].join('\n');
}

export function buildRekapKelas(ctx: LaporanContext, _now = new Date(), wa?: LaporanWaBuildOptions) {
  const byKelas: Record<string, number> = {};
  for (const s of ctx.santri) {
    const kelas = String(s.kelas ?? 'Tanpa kelas');
    byKelas[kelas] = (byKelas[kelas] ?? 0) + 1;
  }
  const lines = Object.entries(byKelas)
    .sort((a, b) => b[1] - a[1])
    .map(([kelas, n], idx) => waNumberedBlock(idx + 1, `*${kelas}*`, [`${n} santri`]))
    .join('\n\n');

  const header = laporanWaHeader(ctx, '📚', 'REKAP SANTRI PER KELAS', [
    `Total santri: *${ctx.santri.length}*`,
  ], wa);

  return [
    header,
    waBlank(),
    lines || waEmptyState('(Belum ada data santri)'),
    waFooterNote(),
  ].join('\n');
}

export function buildRekapWilayah(ctx: LaporanContext, _now = new Date(), wa?: LaporanWaBuildOptions) {
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

  const mapRanked = (items: { name: string; count: number }[]) =>
    items
      .map((r, idx) => waNumberedBlock(idx + 1, `*${r.name}*`, [`${r.count} santri`]))
      .join('\n\n');

  const provLines =
    rankedProv.length > 0 ? mapRanked(rankedProv) : waEmptyState('(Belum ada data provinsi)');

  const kotaLines =
    rankedKota.length > 0
      ? mapRanked(rankedKota.slice(0, 15))
      : waEmptyState('(Belum ada data kota/kabupaten)');

  const kecamatanLines =
    rankedKecamatan.length > 0
      ? mapRanked(rankedKecamatan.slice(0, 20))
      : waEmptyState(
          '(Belum ada data kecamatan — isi asal kecamatan di profil santri)'
        );

  const detailSantri =
    withAsal.length > 0
      ? withAsal
          .map((s, idx) => {
            const nama = String((s as EntityRow & { nama?: string }).nama ?? 'Santri');
            return waNumberedBlock(idx + 1, `*${nama}*`, [formatAsalWilayah(s)]);
          })
          .join('\n\n')
      : waEmptyState('(Belum ada santri dengan asal wilayah)');

  const topProv = rankedProv[0];
  const metaExtra = topProv
    ? [`🏆 Provinsi terbanyak: *${topProv.name}* (${topProv.count} santri)`]
    : [];

  const header = laporanWaHeader(ctx, '🗺️', 'REKAP SEBARAN ASAL SANTRI', [
    `Data asal terisi: *${withAsal.length}* / ${santri.length} santri`,
    ...metaExtra,
  ], wa);

  return [
    header,
    waBlank(),
    waSectionTitle('Peringkat provinsi'),
    provLines,
    waSubsection('Peringkat kota/kabupaten (15 teratas)'),
    kotaLines,
    waSubsection('Peringkat kecamatan (20 teratas)'),
    kecamatanLines,
    waSubsection('Daftar per santri'),
    detailSantri,
    `\n${WA_INDENT}_Peta interaktif: menu Laporan → Sebaran Wilayah._`,
    waFooterNote(),
  ].join('\n');
}

function tagihanSisa(row: EntityRow): number {
  const explicit = Number(row.sisa);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return Math.max(0, Number(row.nominal ?? 0) - Number(row.terbayar ?? 0));
}

function tagihanStatusOf(row: EntityRow): LaporanTagihanStatus {
  const st = String(row.status ?? '');
  if (st === 'belum' || st === 'sebagian' || st === 'lunas') return st;
  const nominal = Number(row.nominal ?? 0);
  const terbayar = Number(row.terbayar ?? 0);
  if (nominal > 0 && terbayar >= nominal) return 'lunas';
  if (terbayar > 0) return 'sebagian';
  return 'belum';
}

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Tunggakan laporan = sisa > 0 dan sudah lewat jatuh tempo (atau akhir bulan periode). */
function isLaporanTagihanTunggakan(row: EntityRow, today = todayYmdLocal()): boolean {
  if (tagihanSisa(row) <= 0) return false;
  const jt = String(row.jatuh_tempo ?? '').trim().slice(0, 10);
  let due: string | null = /^\d{4}-\d{2}-\d{2}$/.test(jt) ? jt : null;
  if (!due) {
    const m = String(row.periode ?? '').match(/^(\d{4})-(\d{2})$/);
    if (m) {
      const last = new Date(Number(m[1]), Number(m[2]), 0);
      due = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
    }
  }
  if (!due) return false;
  return due < today;
}

function formatRp(n: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

/** Peringkat pelanggaran dari catatan BK jenis Pelanggaran pada periode. */
export function computePelanggaranPeriodRanks(
  ctx: LaporanContext,
  now = new Date()
): LaporanPelanggaranRank[] {
  const rows = ctx.pembinaan.filter(
    (p) =>
      String(p.jenis) === 'Pelanggaran' && inCtxPeriod(rowDate(p, 'tanggal'), ctx, now)
  );
  const map = new Map<string, LaporanPelanggaranRank>();
  for (const p of rows) {
    const santriId = String(p.santri_id ?? '');
    const nama = String(p.santri_nama ?? 'Santri');
    const key = santriId || nama;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const meta =
      (santriId ? ctx.santri.find((s) => String(s.id) === santriId) : undefined) ??
      ctx.santri.find((s) => String(s.nama) === nama);
    map.set(key, {
      santriId,
      nama: meta ? String(meta.nama ?? nama) : nama,
      kelas: String(meta?.kelas ?? p.santri_kelas ?? '—'),
      kamar: String(meta?.kamar ?? p.santri_kamar ?? '—'),
      count: 1,
    });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.nama.localeCompare(b.nama, 'id'));
}

export function buildRekapPelanggaran(
  ctx: LaporanContext,
  now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  const { label } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const ranked = computePelanggaranPeriodRanks(ctx, now);

  const lines =
    ranked.length > 0
      ? ranked
          .map((s, idx) =>
            waNumberedBlock(idx + 1, `*${s.nama}*`, [
              `Kelas: ${s.kelas} · Kamar: ${s.kamar}`,
              `Pelanggaran (periode): *${s.count}x*`,
            ])
          )
          .join('\n\n')
      : waEmptyState('(Belum ada catatan pelanggaran pada periode ini)');

  const header = laporanWaHeader(ctx, '⚠️', 'PERINGKAT PELANGGARAN', [
    `📆 Periode: *${label}*`,
    `Santri bermasalah: *${ranked.length}*`,
  ], wa);

  return [header, waBlank(), lines, waFooterNote()].join('\n');
}

function bumpSantriSisa(
  map: Map<string, LaporanPembayaranSantriSisa>,
  t: EntityRow,
  sisa: number
): void {
  const santriId = String(t.santri_id ?? '');
  const nama = String(t.santri_nama ?? 'Santri');
  const key = santriId || nama;
  const cur = map.get(key) ?? {
    santriId,
    nama,
    kelas: String(t.santri_kelas ?? '—'),
    kamar: String(t.santri_kamar ?? '—'),
    totalSisa: 0,
    jumlahTagihan: 0,
  };
  cur.totalSisa += sisa;
  cur.jumlahTagihan += 1;
  map.set(key, cur);
}

function sortSantriSisa(rows: LaporanPembayaranSantriSisa[]): LaporanPembayaranSantriSisa[] {
  return [...rows].sort(
    (a, b) => b.totalSisa - a.totalSisa || a.nama.localeCompare(b.nama, 'id')
  );
}

export function computePembayaranRekap(ctx: LaporanContext): LaporanPembayaranRekap {
  const tagihan = ctx.tagihan ?? [];
  const byStatus: Record<LaporanTagihanStatus, number> = {
    belum: 0,
    sebagian: 0,
    lunas: 0,
  };
  let totalNominal = 0;
  let totalTerbayar = 0;
  let totalSisa = 0;
  let totalSisaDalamTempo = 0;
  let totalSisaTunggakan = 0;
  const jenisMap = new Map<
    string,
    { nama: string; jumlah: number; nominal: number; terbayar: number; sisa: number }
  >();
  const belumLunasMap = new Map<string, LaporanPembayaranSantriSisa>();
  const tunggakanMap = new Map<string, LaporanPembayaranSantriSisa>();

  for (const t of tagihan) {
    const nominal = Number(t.nominal ?? 0);
    const terbayar = Number(t.terbayar ?? 0);
    const sisa = tagihanSisa(t);
    const status = tagihanStatusOf(t);
    byStatus[status] += 1;
    totalNominal += nominal;
    totalTerbayar += terbayar;
    totalSisa += sisa;

    const namaJenis = String(t.nama_jenis ?? 'Lainnya');
    const j = jenisMap.get(namaJenis) ?? {
      nama: namaJenis,
      jumlah: 0,
      nominal: 0,
      terbayar: 0,
      sisa: 0,
    };
    j.jumlah += 1;
    j.nominal += nominal;
    j.terbayar += terbayar;
    j.sisa += sisa;
    jenisMap.set(namaJenis, j);

    if (sisa <= 0) continue;
    if (isLaporanTagihanTunggakan(t)) {
      totalSisaTunggakan += sisa;
      bumpSantriSisa(tunggakanMap, t, sisa);
    } else {
      totalSisaDalamTempo += sisa;
      bumpSantriSisa(belumLunasMap, t, sisa);
    }
  }

  return {
    totalTagihan: tagihan.length,
    totalNominal,
    totalTerbayar,
    totalSisa,
    totalSisaDalamTempo,
    totalSisaTunggakan,
    byStatus,
    byJenis: [...jenisMap.values()].sort((a, b) => b.sisa - a.sisa || b.nominal - a.nominal),
    belumLunas: sortSantriSisa([...belumLunasMap.values()]),
    tunggakan: sortSantriSisa([...tunggakanMap.values()]),
  };
}

export function buildRekapPembayaran(
  ctx: LaporanContext,
  now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  const { label } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const rekap = computePembayaranRekap(ctx);

  const jenisLines =
    rekap.byJenis.length > 0
      ? rekap.byJenis
          .map((j, idx) =>
            waNumberedBlock(idx + 1, `*${j.nama}*`, [
              `${j.jumlah} tagihan`,
              `Nominal: *${formatRp(j.nominal)}*`,
              `Terbayar: ${formatRp(j.terbayar)} · Sisa: *${formatRp(j.sisa)}*`,
            ])
          )
          .join('\n\n')
      : waEmptyState('(Belum ada tagihan pada periode ini)');

  const belumLunasLines =
    rekap.belumLunas.length > 0
      ? rekap.belumLunas
          .map((t, idx) =>
            waNumberedBlock(idx + 1, `*${t.nama}*`, [
              `Kelas: ${t.kelas} · Kamar: ${t.kamar}`,
              `Sisa: *${formatRp(t.totalSisa)}* (${t.jumlahTagihan} tagihan) · masih dalam tempo`,
            ])
          )
          .join('\n\n')
      : waEmptyState('(Tidak ada tagihan belum lunas dalam tempo)');

  const tunggakanLines =
    rekap.tunggakan.length > 0
      ? rekap.tunggakan
          .map((t, idx) =>
            waNumberedBlock(idx + 1, `*${t.nama}*`, [
              `Kelas: ${t.kelas} · Kamar: ${t.kamar}`,
              `Sisa: *${formatRp(t.totalSisa)}* (${t.jumlahTagihan} tagihan) · sudah jatuh tempo`,
            ])
          )
          .join('\n\n')
      : waEmptyState('(Tidak ada tunggakan / lewat jatuh tempo)');

  const header = laporanWaHeader(ctx, '💰', 'REKAP PEMBAYARAN', [
    `📆 Periode tagihan: *${label}*`,
    `🧾 Tagihan: *${rekap.totalTagihan}*`,
    `Nominal: *${formatRp(rekap.totalNominal)}* · Terbayar: *${formatRp(rekap.totalTerbayar)}* · Sisa: *${formatRp(rekap.totalSisa)}*`,
    `Dalam tempo: *${formatRp(rekap.totalSisaDalamTempo)}* · Tunggakan: *${formatRp(rekap.totalSisaTunggakan)}*`,
    `Status: belum ${rekap.byStatus.belum} · sebagian ${rekap.byStatus.sebagian} · lunas ${rekap.byStatus.lunas}`,
  ], wa);

  return [
    header,
    waBlank(),
    waSectionTitle('Per jenis tagihan'),
    jenisLines,
    waSubsection(
      `Belum lunas — masih dalam tempo (${rekap.belumLunas.length} santri)`
    ),
    belumLunasLines,
    waSubsection(
      `Tunggakan — sudah jatuh tempo (${rekap.tunggakan.length} santri)`
    ),
    tunggakanLines,
    waFooterNote(),
  ].join('\n');
}

const BUILDERS: Record<
  LaporanReportId,
  (ctx: LaporanContext, now?: Date, wa?: LaporanWaBuildOptions) => string
> = {
  harian: buildLaporanHarian,
  absensi: buildRekapAbsensi,
  izin: buildRekapIzin,
  pembinaan: buildRekapPembinaan,
  kamar: buildRekapKamar,
  kelas: buildRekapKelas,
  pelanggaran: buildRekapPelanggaran,
  wilayah: buildRekapWilayah,
  pembayaran: buildRekapPembayaran,
};

export function buildReport(
  id: LaporanReportId,
  ctx: LaporanContext,
  now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  return BUILDERS[id](ctx, now, wa);
}

export const LAPORAN_BUNDLE_IDS: LaporanReportId[] = [
  'harian',
  // Sementara disembunyikan: absensi, izin, kamar, wilayah
  'pembinaan',
  'kelas',
  'pelanggaran',
];

export const LAPORAN_SECTION_TITLES: Record<LaporanReportId, string> = {
  harian: 'Laporan Harian Lengkap',
  absensi: 'Rekap Absensi',
  izin: 'Rekap Perizinan',
  pembinaan: 'Rekap Pelanggaran',
  kamar: 'Rekap Hunian Kamar',
  kelas: 'Rekap Santri per Kelas',
  pelanggaran: 'Peringkat Pelanggaran',
  wilayah: 'Sebaran Asal Wilayah',
  pembayaran: 'Rekap Pembayaran',
};

/** Gabungan semua teks laporan (format WhatsApp). */
export function buildAllReportsBundle(ctx: LaporanContext, now = new Date()): string {
  const { label } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const total = LAPORAN_BUNDLE_IDS.length;
  const cover = waBundleCover({
    namaAsrama: ctx.namaAsrama,
    periodLabel: label,
    now,
    sectionCount: total,
  });

  const bundleWa: LaporanWaBuildOptions = { skipGreeting: true };
  const sections = LAPORAN_BUNDLE_IDS.map((id, i) => {
    const sep = waBundleSectionSeparator(LAPORAN_SECTION_TITLES[id], i + 1, total);
    return `${sep}${buildReport(id, ctx, now, bundleWa)}`;
  });

  return [cover, ...sections].join('');
}
