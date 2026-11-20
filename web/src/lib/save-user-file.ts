import { Capacitor } from '@capacitor/core';
import { Directory } from '@capacitor/filesystem';
import write_blob from 'capacitor-blob-writer';
import type { FileSaveMethod } from '@/lib/file-download-hints';
import { SaveToDownloads } from '@/lib/save-to-downloads-plugin';

export type SaveUserFileResult = {
  method: FileSaveMethod;
  filename: string;
};

function sanitizeFilename(name: string): string {
  const trimmed = name.replace(/[/\\?%*:|"<>]/g, '-').trim();
  return trimmed || 'unduhan';
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Gagal membaca berkas'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Gagal membaca berkas'));
    reader.readAsDataURL(blob);
  });
}

function triggerBrowserDownload(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Simpan berkas ke folder Unduhan (browser / Android) atau Dokumen aplikasi (iOS).
 */
export async function saveUserFile(
  blob: Blob,
  filename: string,
  mimeType = 'application/octet-stream',
): Promise<SaveUserFileResult> {
  const safeName = sanitizeFilename(filename);

  if (Capacitor.getPlatform() === 'android') {
    try {
      const data = await blobToBase64(blob);
      await SaveToDownloads.saveBase64({
        filename: safeName,
        data,
        mimeType,
      });
      return { method: 'native_downloads', filename: safeName };
    } catch {
      // lanjut ke unduhan browser / fallback
    }
  }

  if (Capacitor.getPlatform() === 'ios') {
    try {
      await write_blob({
        path: safeName,
        directory: Directory.Documents,
        blob,
        recursive: true,
      });
      return { method: 'native_documents', filename: safeName };
    } catch {
      // lanjut ke unduhan browser
    }
  }

  if (triggerBrowserDownload(blob, safeName)) {
    return { method: 'browser_download', filename: safeName };
  }

  throw new Error('Gagal menyimpan berkas');
}

export async function saveTextUserFile(
  content: string,
  filename: string,
  mimeType = 'text/plain;charset=utf-8',
): Promise<SaveUserFileResult> {
  const blob = new Blob([content], { type: mimeType });
  return saveUserFile(blob, filename, mimeType);
}
