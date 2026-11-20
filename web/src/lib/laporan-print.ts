import { Capacitor } from '@capacitor/core';
import { format } from 'date-fns';
import { notifyFileSaved } from '@/lib/file-download-hints';
import {
  buildLaporanTablesDocumentHtml,
  buildSingleSantriDocumentHtml,
  LAPORAN_TABLE_SECTION_TITLES,
} from '@/lib/laporan-html-tables';
import { saveHtmlAsPdf, shareHtmlAsPdf } from '@/lib/save-html-as-pdf';
import { toast } from '@/lib/toast';
import {
  buildAllReportsBundle,
  buildLaporanHarian,
  type LaporanContext,
  type LaporanReportId,
} from '@/lib/laporan-reports';

/** Unduhan: HTML tabel (bukan teks WhatsApp). */
export function buildLaporanBundlePrintHtml(ctx: LaporanContext, now = new Date()): string {
  return buildLaporanTablesDocumentHtml(ctx, now);
}

function safeFilenamePart(text: string): string {
  return text.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 48) || 'laporan';
}

function laporanBundleFilename(ctx: LaporanContext, now: Date): string {
  const stamp = format(now, 'yyyy-MM-dd');
  return `laporan-${safeFilenamePart(ctx.namaAsrama)}-${stamp}.pdf`;
}

/** Unduh paket laporan (PDF di Android; HTML + cetak di web/iOS). */
export async function downloadLaporanBundle(ctx: LaporanContext, now = new Date()): Promise<void> {
  const html = buildLaporanBundlePrintHtml(ctx, now);
  const filename = laporanBundleFilename(ctx, now);

  try {
    const { method, filename: savedName } = await saveHtmlAsPdf(html, filename);
    notifyFileSaved(method, savedName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal menyimpan PDF';
    if (Capacitor.getPlatform() === 'android') {
      toast.error(msg.length > 160 ? 'Gagal menyimpan PDF. Coba lagi.' : msg);
      return;
    }
    printLaporanBundlePdf(ctx, now);
    notifyFileSaved('print_dialog', filename);
  }
}

export function printLaporanBundlePdf(ctx: LaporanContext, now = new Date()): void {
  const html = buildLaporanBundlePrintHtml(ctx, now);
  const filename = laporanBundleFilename(ctx, now);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Cetak laporan');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    toast.error('Gagal membuka pratinjau cetak.');
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 500);
  };

  win.document.title = filename.replace(/\.html$/i, '');

  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  if (doc.readyState === 'complete') {
    setTimeout(doPrint, 150);
  } else {
    iframe.onload = () => setTimeout(doPrint, 150);
  }
}

export function printSingleLaporanPdf(id: LaporanReportId, ctx: LaporanContext, now = new Date()): void {
  const title = LAPORAN_TABLE_SECTION_TITLES[id];
  const stamp = format(now, 'yyyy-MM-dd-HHmm');
  const singleHtml = buildLaporanTablesDocumentHtml(ctx, now, {
    title,
    ids: [id],
  });
  void printHtmlDocument(singleHtml, `laporan-${id}-${stamp}.pdf`);
}

async function printHtmlDocument(html: string, filename: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Cetak laporan');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    toast.error('Gagal membuka cetak.');
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  if (!win) {
    document.body.removeChild(iframe);
    return;
  }
  win.document.title = filename.replace(/\.html$/i, '');
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  }, 150);
}

function santriFilteredCtx(
  ctx: LaporanContext,
  santriId: string
): { filtered: LaporanContext; nama: string } {
  const s =
    ctx.santri.find((x) => String(x.id) === santriId) ??
    ctx.santri.find((x) => String(x.nama) === santriId);
  const nama = String(s?.nama ?? 'Santri');
  const sid = String(s?.id ?? santriId);
  const match = (row: Record<string, unknown>) =>
    String(row.santri_id ?? '') === sid || String(row.santri_nama ?? '') === nama;
  return {
    nama,
    filtered: {
      ...ctx,
      santri: s ? [s] : ctx.santri.filter((x) => String(x.id) === santriId),
      absensi: ctx.absensi.filter(match),
      izin: ctx.izin.filter(match),
      pembinaan: ctx.pembinaan.filter(match),
    },
  };
}

function singleLaporanHtml(
  id: LaporanReportId,
  ctx: LaporanContext,
  santriId: string | undefined,
  now: Date
): { html: string; filename: string; title: string } {
  const stamp = format(now, 'yyyy-MM-dd-HHmm');
  let useCtx = ctx;
  let title = LAPORAN_TABLE_SECTION_TITLES[id];
  let namePart = '';
  if (santriId) {
    const { filtered, nama } = santriFilteredCtx(ctx, santriId);
    useCtx = filtered;
    title = `${title} — ${nama}`;
    namePart = `-${safeFilenamePart(nama)}`;
  }
  const html = buildLaporanTablesDocumentHtml(useCtx, now, { title, ids: [id] });
  return { html, filename: `laporan-${id}${namePart}-${stamp}.pdf`, title };
}

async function savePdfWithPrintFallback(html: string, filename: string): Promise<void> {
  try {
    const { method, filename: savedName } = await saveHtmlAsPdf(html, filename);
    notifyFileSaved(method, savedName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal menyimpan PDF';
    if (Capacitor.getPlatform() === 'android') {
      toast.error(msg.length > 160 ? 'Gagal menyimpan PDF. Coba lagi.' : msg);
      return;
    }
    await printHtmlDocument(html, filename);
    notifyFileSaved('print_dialog', filename);
  }
}

async function sharePdf(html: string, filename: string, title: string): Promise<void> {
  try {
    const result = await shareHtmlAsPdf(html, filename, title);
    if (result === 'fallback_saved') notifyFileSaved('native_downloads', filename);
  } catch {
    toast.error('Gagal membagikan laporan');
  }
}

/** Unduh satu jenis laporan (semua santri atau satu santri). */
export async function downloadSingleLaporanPdf(
  id: LaporanReportId,
  ctx: LaporanContext,
  santriId?: string,
  now = new Date()
): Promise<void> {
  const { html, filename } = singleLaporanHtml(id, ctx, santriId, now);
  await savePdfWithPrintFallback(html, filename);
}

/** Bagikan satu jenis laporan (semua santri atau satu santri) via share sheet. */
export async function shareSingleLaporanPdf(
  id: LaporanReportId,
  ctx: LaporanContext,
  santriId?: string,
  now = new Date()
): Promise<void> {
  const { html, filename, title } = singleLaporanHtml(id, ctx, santriId, now);
  await sharePdf(html, filename, title);
}

/** Cetak satu jenis laporan untuk satu santri (tabel). */
export function printSingleLaporanPdfForSantri(
  id: LaporanReportId,
  ctx: LaporanContext,
  santriId: string,
  now = new Date()
): void {
  const { html, filename } = singleLaporanHtml(id, ctx, santriId, now);
  void printHtmlDocument(html, filename);
}

/** Bagikan paket laporan lengkap via share sheet. */
export async function shareLaporanBundle(ctx: LaporanContext, now = new Date()): Promise<void> {
  const html = buildLaporanBundlePrintHtml(ctx, now);
  await sharePdf(html, laporanBundleFilename(ctx, now), `Laporan Lengkap ${ctx.namaAsrama}`);
}

/** Bagikan laporan satu santri via share sheet. */
export async function shareLaporanPerSantri(
  ctx: LaporanContext,
  santriId: string,
  now = new Date()
): Promise<void> {
  const { nama } = santriFilteredCtx(ctx, santriId);
  const html = buildSingleSantriDocumentHtml(ctx, santriId, now);
  await sharePdf(
    html,
    `laporan-santri-${safeFilenamePart(nama)}-${format(now, 'yyyy-MM-dd')}.pdf`,
    `Laporan Santri — ${nama}`
  );
}

/** Bagikan laporan per santri (semua) via share sheet. */
export async function shareLaporanSemuaPerSantri(ctx: LaporanContext, now = new Date()): Promise<void> {
  const html = buildLaporanTablesDocumentHtml(ctx, now, {
    title: 'Laporan per santri (tabel)',
    ids: ['persantri'],
  });
  const filename = `laporan-per-santri-${safeFilenamePart(ctx.namaAsrama)}-${format(now, 'yyyy-MM-dd')}.pdf`;
  await sharePdf(html, filename, `Laporan Santri ${ctx.namaAsrama}`);
}

/** Unduh laporan satu santri (tabel). */
export async function downloadLaporanPerSantri(
  ctx: LaporanContext,
  santriId: string,
  now = new Date()
): Promise<void> {
  const s = ctx.santri.find((x) => String(x.id) === santriId);
  const nama = String(s?.nama ?? 'santri');
  const html = buildSingleSantriDocumentHtml(ctx, santriId, now);
  const filename = `laporan-santri-${safeFilenamePart(nama)}-${format(now, 'yyyy-MM-dd')}.pdf`;

  try {
    const { method, filename: savedName } = await saveHtmlAsPdf(html, filename);
    notifyFileSaved(method, savedName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal menyimpan PDF';
    if (Capacitor.getPlatform() === 'android') {
      toast.error(msg.length > 160 ? 'Gagal menyimpan PDF. Coba lagi.' : msg);
      return;
    }
    await printHtmlDocument(html, filename);
    notifyFileSaved('print_dialog', filename);
  }
}

/** Unduh hanya bagian laporan per santri (semua). */
export async function downloadLaporanSemuaPerSantri(
  ctx: LaporanContext,
  now = new Date()
): Promise<void> {
  const html = buildLaporanTablesDocumentHtml(ctx, now, {
    title: 'Laporan per santri (tabel)',
    ids: ['persantri'],
  });
  const filename = `laporan-per-santri-${safeFilenamePart(ctx.namaAsrama)}-${format(now, 'yyyy-MM-dd')}.pdf`;

  try {
    const { method, filename: savedName } = await saveHtmlAsPdf(html, filename);
    notifyFileSaved(method, savedName);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal menyimpan PDF';
    if (Capacitor.getPlatform() === 'android') {
      toast.error(msg.length > 160 ? 'Gagal menyimpan PDF. Coba lagi.' : msg);
      return;
    }
    await printHtmlDocument(html, filename);
    notifyFileSaved('print_dialog', filename);
  }
}

export async function shareLaporanHarian(ctx: LaporanContext, now = new Date()): Promise<void> {
  const text = buildLaporanHarian(ctx, now);
  const title = `Laporan Harian ${ctx.namaAsrama}`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }

  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    toast.error('Tidak bisa membuka WhatsApp. Gunakan tombol unduh laporan.');
  }
}

export async function shareAllLaporan(ctx: LaporanContext, now = new Date()): Promise<void> {
  const text = buildAllReportsBundle(ctx, now);
  const title = `Laporan ${ctx.namaAsrama}`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }

  const maxWa = 3500;
  const payload =
    text.length > maxWa
      ? `${text.slice(0, maxWa)}\n\n_(Terpotong — gunakan Unduh PDF untuk laporan lengkap.)_`
      : text;

  const url = `https://wa.me/?text=${encodeURIComponent(payload)}`;
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    toast.error('Tidak bisa membuka WhatsApp. Gunakan tombol unduh laporan.');
  }
}
