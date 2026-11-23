import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { HtmlToPdf } from '@/lib/html-to-pdf-plugin';
import { saveTextUserFile, type SaveUserFileResult } from '@/lib/save-user-file';

function ensurePdfExtension(filename: string): string {
  return /\.pdf$/i.test(filename) ? filename : `${filename.replace(/\.html$/i, '')}.pdf`;
}

/**
 * Simpan HTML sebagai PDF di Android (WebView → PDF → Unduhan).
 * Di web/iOS: unduh HTML (buka lalu cetak ke PDF).
 */
export async function saveHtmlAsPdf(
  html: string,
  filename: string,
  options?: { landscape?: boolean },
): Promise<SaveUserFileResult> {
  const pdfName = ensurePdfExtension(filename);

  if (Capacitor.getPlatform() === 'android') {
    await HtmlToPdf.fromHtml({
      html,
      filename: pdfName,
      landscape: options?.landscape ?? false,
      openAfterSave: true,
    });
    return { method: 'native_downloads', filename: pdfName };
  }

  const htmlName = pdfName.replace(/\.pdf$/i, '.html');
  return saveTextUserFile(html, htmlName, 'text/html');
}

function isShareCanceled(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  if (e.name === 'AbortError') return true;
  const msg = (e.message ?? '').toLowerCase();
  return msg.includes('share canceled') || msg.includes('share cancelled') || msg.includes('abort');
}

/**
 * Bagikan HTML sebagai PDF lewat share sheet native (Android → WhatsApp dll).
 * Di web/Electron: coba Web Share API dengan berkas, kalau tidak didukung → simpan.
 *
 * Catatan Android: Capacitor Share hanya menerima file:// / http — bukan content://
 * MediaStore. HtmlToPdf mengembalikan file:// di cache untuk share.
 */
export async function shareHtmlAsPdf(
  html: string,
  filename: string,
  title?: string,
): Promise<'shared' | 'fallback_saved' | 'canceled'> {
  const pdfName = ensurePdfExtension(filename);

  if (Capacitor.getPlatform() === 'android') {
    const { uri } = await HtmlToPdf.fromHtml({ html, filename: pdfName, openAfterSave: false });
    try {
      // Wajib file:// via files[] — content:// MediaStore ditolak ("Unsupported url").
      await Share.share({
        title: title ?? pdfName,
        files: [uri],
        dialogTitle: 'Bagikan laporan',
      });
      return 'shared';
    } catch (err) {
      if (isShareCanceled(err)) return 'canceled';
      throw err;
    }
  }

  const htmlName = pdfName.replace(/\.pdf$/i, '.html');
  const file = new File([html], htmlName, { type: 'text/html' });
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: title ?? htmlName });
      return 'shared';
    } catch (err) {
      if (isShareCanceled(err)) return 'canceled';
      throw err;
    }
  }

  // Electron / browser tanpa file share: coba teks dulu, lalu unduh HTML.
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: title ?? htmlName, text: title ?? htmlName });
      await saveTextUserFile(html, htmlName, 'text/html');
      return 'fallback_saved';
    } catch (err) {
      if (isShareCanceled(err)) return 'canceled';
    }
  }

  await saveTextUserFile(html, htmlName, 'text/html');
  return 'fallback_saved';
}
