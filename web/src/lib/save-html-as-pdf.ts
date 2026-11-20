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

/**
 * Bagikan HTML sebagai PDF lewat share sheet native (Android → WhatsApp dll).
 * Di web/Electron: coba Web Share API dengan berkas, kalau tidak didukung → simpan.
 */
export async function shareHtmlAsPdf(
  html: string,
  filename: string,
  title?: string,
): Promise<'shared' | 'fallback_saved'> {
  const pdfName = ensurePdfExtension(filename);

  if (Capacitor.getPlatform() === 'android') {
    const { uri } = await HtmlToPdf.fromHtml({ html, filename: pdfName, openAfterSave: false });
    await Share.share({ title: title ?? pdfName, url: uri, dialogTitle: 'Bagikan laporan' });
    return 'shared';
  }

  const htmlName = pdfName.replace(/\.pdf$/i, '.html');
  const file = new File([html], htmlName, { type: 'text/html' });
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };
  if (typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare({ files: [file] })) {
    await nav.share({ files: [file], title: title ?? htmlName });
    return 'shared';
  }

  await saveTextUserFile(html, htmlName, 'text/html');
  return 'fallback_saved';
}
