import { Capacitor } from '@capacitor/core';
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
