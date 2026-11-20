import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  isWithinInterval,
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

export type LaporanPeriod = 'today' | '7d' | '30d' | 'month' | 'custom';

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
  | 'wilayah';

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
  /** Master kegiatan (untuk rekap absensi per agenda) */
  kegiatan?: KegiatanSchedule[];
  /** Koordinat provinsi untuk rekap sebaran (opsional) */
  wilayahProvinsiGeo?: LaporanWilayahGeo[];
};

export function periodLabel(period: LaporanPeriod, customRange?: LaporanCustomRange): string {
  if (period === 'custom') {
    return laporanRekapInterval('custom', customRange).label;
  }
  switch (period) {
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

function inPeriod(
  iso: string,
  period: LaporanPeriod,
  customRange?: LaporanCustomRange,
  now = new Date()
) {
  if (!iso) return false;
  const { start, end } = laporanRekapInterval(period, customRange, now);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return isWithinInterval(d, { start, end });
}

function inCtxPeriod(iso: string, ctx: LaporanContext, now = new Date()) {
  return inPeriod(iso, ctx.period, ctx.customRange, now);
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

  const detail =
    rows.length > 0
      ? rows
          .map((i, idx) => {
            const st = i.status_kembali === 'Belum' ? '⏳ Belum kembali' : '✅ Sudah kembali';
            return waNumberedBlock(
              idx + 1,
              `*${String(i.santri_nama)}* · Kamar ${String(i.santri_kamar ?? '-')}`,
              [
                `Status: ${st}`,
                `Keluar: ${fmtShortDateTime(rowDate(i, 'tanggal_keluar'))}`,
                `Batas: *${formatIzinBatasKembali(rowDate(i, 'batas_kembali'))}*`,
                `Alasan: ${String(i.alasan ?? '-')}`,
                `Penjemput: ${String(i.penjemput ?? '-')}`,
              ]
            );
          })
          .join('\n\n')
      : waEmptyState('(Tidak ada izin pada periode ini)');

  const header = laporanWaHeader(ctx, '🚪', 'REKAP PERIZINAN', [
    `📆 Periode: *${label}*`,
    `📋 Total izin: *${rows.length}*`,
    `⏳ Belum kembali: *${belum.length}* · ✅ Sudah: *${sudah.length}*`,
  ], wa);

  return [header, waBlank(), waSectionTitle('Rincian'), detail, waFooterNote()].join('\n');
}

export function buildRekapPembinaan(
  ctx: LaporanContext,
  now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  const { label } = laporanRekapInterval(ctx.period, ctx.customRange, now);
  const rows = ctx.pembinaan.filter((p) => inCtxPeriod(rowDate(p, 'tanggal'), ctx, now));
  const summary = computeLaporanSummary(ctx, now);

  const jenisLines = Object.entries(summary.bkByJenis)
    .map(([j, n]) => waBulletLine(`${j}: *${n}*`))
    .join('\n');

  const detail =
    rows.length > 0
      ? rows
          .map((p, idx) => {
            const lines = [
              `Jenis: *${String(p.jenis)}* · ${fmtShortDate(rowDate(p, 'tanggal'))}`,
              `Keterangan: ${String(p.keterangan ?? '-')}`,
            ];
            if (p.tindak_lanjut) {
              lines.push(`Tindak lanjut: ${String(p.tindak_lanjut)}`);
            }
            return waNumberedBlock(
              idx + 1,
              `*${String(p.santri_nama)}* · Kamar ${String(p.santri_kamar ?? '-')}`,
              lines
            );
          })
          .join('\n\n')
      : waEmptyState('(Belum ada catatan pelanggaran/pembinaan pada periode ini)');

  const header = laporanWaHeader(ctx, '🛡️', 'REKAP PELANGGARAN/PEMBINAAN', [
    `📆 Periode: *${label}*`,
    `📝 Total catatan: *${rows.length}*`,
  ], wa);

  return [
    header,
    waBlank(),
    waSectionTitle('Ringkasan jenis'),
    jenisLines || waEmptyState('(Belum ada)'),
    waSubsection('Rincian'),
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

export function buildRekapPelanggaran(
  ctx: LaporanContext,
  _now = new Date(),
  wa?: LaporanWaBuildOptions
) {
  const ranked = [...ctx.santri]
    .map((s) => ({
      nama: String(s.nama ?? 'Santri'),
      kamar: String(s.kamar ?? '-'),
      kelas: String(s.kelas ?? '-'),
      poin: Number(s.jumlah_pelanggaran ?? 0),
    }))
    .filter((s) => s.poin > 0)
    .sort((a, b) => b.poin - a.poin);

  const lines =
    ranked.length > 0
      ? ranked
          .map((s, idx) =>
            waNumberedBlock(idx + 1, `*${s.nama}*`, [
              `Kelas: ${s.kelas} · Kamar: ${s.kamar}`,
              `Akumulasi: *${s.poin}x* pelanggaran`,
            ])
          )
          .join('\n\n')
      : waEmptyState('(Belum ada santri dengan hitungan pelanggaran)');

  const header = laporanWaHeader(ctx, '⚠️', 'REKAP JUMLAH PELANGGARAN', [
    `Santri bermasalah: *${ranked.length}*`,
  ], wa);

  return [header, waBlank(), lines, waFooterNote()].join('\n');
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
  pembinaan: 'Rekap Pelanggaran/Pembinaan',
  kamar: 'Rekap Hunian Kamar',
  kelas: 'Rekap Santri per Kelas',
  pelanggaran: 'Peringkat Pelanggaran',
  wilayah: 'Sebaran Asal Wilayah',
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
