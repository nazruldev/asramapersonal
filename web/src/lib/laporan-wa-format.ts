import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

const ABSENSI_STATUS_ORDER = ['Hadir', 'Izin', 'Sakit', 'Alpa'] as const;

export type WaAbsensiStatusCounts = Record<string, number>;

/** Indent standar sub-item (3 spasi — konsisten di semua WA). */
export const WA_INDENT = '   ';
/** Indent level kedua (detail di bawah item bernomor). */
export const WA_INDENT2 = '      ';

export const WA_LINE = '━━━━━━━━━━━━━━━━━━━━';
export const WA_LINE_THIN = '────────────────────';

export function waDivider(line = WA_LINE): string {
  return line;
}

export function waGreeting(): string {
  return `Assalamu'alaikum Warahmatullahi Wabarakatuh`;
}

export function waBlank(): string {
  return '';
}

export function waBulletLine(text: string, indent = WA_INDENT): string {
  return `${indent}• ${text}`;
}

export function waLabelValue(label: string, value: string, boldValue = true): string {
  const v = boldValue ? `*${value}*` : value;
  return waBulletLine(`${label}: ${v}`);
}

export function waSectionTitle(title: string): string {
  return `*${title}*`;
}

export function waSubsection(title: string): string {
  return `\n${waSectionTitle(title)}`;
}

export function waEmptyState(message: string): string {
  return `${WA_INDENT}${message}`;
}

export function waFooterNote(note = 'Dibuat otomatis · aplikasi Pengelola Asrama'): string {
  return `\n${WA_LINE_THIN}\n_${note}_`;
}

export function waReportHeader(input: {
  badge: string;
  title: string;
  namaAsrama: string;
  metaLines?: string[];
  /** Default true — matikan untuk bagian dalam paket gabungan. */
  includeGreeting?: boolean;
}): string {
  const meta =
    input.metaLines && input.metaLines.length > 0
      ? input.metaLines.map((l) => `${WA_INDENT}${l}`).join('\n')
      : '';
  const includeGreeting = input.includeGreeting !== false;
  const parts: string[] = [];
  if (includeGreeting) {
    parts.push(waGreeting(), '');
  }
  parts.push(
    `${input.badge} ${waSectionTitle(input.title)}`,
    waSectionTitle(input.namaAsrama.toUpperCase()),
    waDivider()
  );
  if (meta) parts.push(meta);
  parts.push(waDivider());
  return parts.join('\n');
}

export function waNumberedBlock(
  index: number,
  headline: string,
  detailLines: string[]
): string {
  const head = `${index}. ${headline}`;
  if (detailLines.length === 0) return head;
  const body = detailLines.map((l) => `${WA_INDENT}${l}`).join('\n');
  return `${head}\n${body}`;
}

export function formatAbsensiStatusCountsWa(counts: WaAbsensiStatusCounts): string {
  const lines: string[] = [];
  for (const s of ABSENSI_STATUS_ORDER) {
    const n = counts[s] ?? 0;
    if (n > 0 || lines.length < ABSENSI_STATUS_ORDER.length) {
      lines.push(waBulletLine(`${s}: *${n}*`, WA_INDENT2));
    }
  }
  for (const [k, n] of Object.entries(counts)) {
    if (
      n > 0 &&
      !ABSENSI_STATUS_ORDER.includes(k as (typeof ABSENSI_STATUS_ORDER)[number])
    ) {
      lines.push(waBulletLine(`${k}: *${n}*`, WA_INDENT2));
    }
  }
  return lines.join('\n');
}

/** Satu baris ringkas (untuk baris harian yang padat). */
export function formatAbsensiStatusCountsInline(counts: WaAbsensiStatusCounts): string {
  const known = ABSENSI_STATUS_ORDER.map((s) => `${s} ${counts[s] ?? 0}`);
  const extra = Object.entries(counts)
    .filter(
      ([k, n]) =>
        n > 0 && !ABSENSI_STATUS_ORDER.includes(k as (typeof ABSENSI_STATUS_ORDER)[number])
    )
    .map(([k, n]) => `${k} ${n}`);
  return [...known, ...extra].join(' · ');
}

export function waBundleCover(input: {
  namaAsrama: string;
  periodLabel: string;
  now: Date;
  sectionCount: number;
}): string {
  const ts = format(input.now, "EEEE, d MMMM yyyy · HH:mm", { locale: localeId });
  return [
    waGreeting(),
    waBlank(),
    `📊 ${waSectionTitle('PAKET LAPORAN LENGKAP')}`,
    waSectionTitle(input.namaAsrama.toUpperCase()),
    waDivider(),
    waBulletLine(`Periode rekap: *${input.periodLabel}*`),
    waBulletLine(`Dibuat: ${ts}`),
    waBulletLine(`Jumlah bagian: *${input.sectionCount}*`),
    waDivider(),
    waBlank(),
    `${WA_INDENT}_Setiap bagian dipisahkan garis. Scroll ke bawah untuk detail._`,
  ].join('\n');
}

export function waBundleSectionSeparator(sectionTitle: string, index: number, total: number): string {
  return `\n\n${WA_LINE}\n📄 *${index}/${total} · ${sectionTitle}*\n${WA_LINE}\n\n`;
}
