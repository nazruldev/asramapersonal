import { Capacitor } from '@capacitor/core';
import { toast } from '@/lib/toast';

export type FileSaveMethod =
  | 'native_share'
  | 'native_downloads'
  | 'native_documents'
  | 'browser_download'
  | 'print_dialog';

export function isNativeApp(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' || Capacitor.isNativePlatform();
}

/** Penjelasan format unduhan laporan per platform. */
export const LAPORAN_FILE_FORMAT_NOTE =
  'Unduhan laporan berbentuk tabel (bukan teks WA). Android: PDF di folder Unduhan. Browser/PC: berkas .html — buka lalu Cetak → Simpan sebagai PDF.';

export function saveLocationHint(method: FileSaveMethod): { title: string; body: string } {
  if (method === 'native_downloads') {
    return {
      title: 'PDF tersimpan di folder Unduhan',
      body:
        'Buka Files / Pengelola berkas → Unduhan (Downloads). Cari berkas .pdf yang baru dibuat.',
    };
  }
  if (method === 'native_documents') {
    return {
      title: 'Tersimpan di Dokumen aplikasi',
      body:
        'Buka aplikasi Files → Dokumen (On My iPhone) → Asrama Manager. Dari sana bisa dibagikan atau dicetak ke PDF.',
    };
  }
  if (method === 'native_share') {
    return {
      title: 'Simpan lewat menu berbagi',
      body:
        'Pilih aplikasi seperti Files, Drive, atau "Simpan ke perangkat". Tentukan folder Unduhan/Dokumen. Cari nama file yang diawali laporan- dan berakhiran .html.',
    };
  }
  if (method === 'print_dialog') {
    return {
      title: 'Simpan dari dialog cetak',
      body:
        'Pilih destinasi "Simpan sebagai PDF" (bukan printer biasa). File PDF biasanya masuk folder Unduhan (Downloads) perangkat Anda.',
    };
  }
  if (isNativeApp()) {
    return {
      title: 'Cek penyimpanan perangkat',
      body:
        'Buka aplikasi Files / Pengelola berkas → Unduhan atau Dokumen. Cari nama file yang Anda unduh (mis. laporan-… .html).',
    };
  }
  return {
    title: 'Folder Unduhan browser',
    body:
      'Di Windows: biasanya Downloads (Unduhan) di PC Anda, mis. C:\\Users\\NamaAnda\\Downloads. Di Mac: folder Unduhan. Lihat juga ikon unduhan di bilah alamat browser.',
  };
}

function backupSaveHint(method: FileSaveMethod, filename: string): { title: string; body: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.sql')) {
    if (method === 'native_downloads') {
      return {
        title: 'Cadangan SQL tersimpan',
        body:
          'Buka Files → Unduhan (Downloads). Berkas: ' +
          filename +
          '. Impor cadangan memilih file .sql yang sama dari folder itu.',
      };
    }
    return {
      title: 'Cadangan SQL tersimpan',
      body: `Berkas ${filename} sudah diunduh. Simpan di folder Unduhan/Downloads agar mudah diimpor lagi.`,
    };
  }
  if (lower.endsWith('.json')) {
    return {
      title: 'Cadangan JSON tersimpan',
      body: `Berkas ${filename} — folder unduhan browser atau Unduhan di HP.`,
    };
  }
  return saveLocationHint(method);
}

export function notifyFileSaved(method: FileSaveMethod, filename: string): void {
  const hint = backupSaveHint(method, filename);
  const isBackup = filename.toLowerCase().endsWith('.sql') || filename.toLowerCase().endsWith('.json');
  toast.success(hint.title, {
    description: isBackup ? hint.body : `${filename}\n${hint.body}`,
    duration: isBackup ? 8_000 : 10_000,
  });
}

export const UNDUH_BANTUAN_BULLET = {
  laporanHtml: LAPORAN_FILE_FORMAT_NOTE,
  hp: 'Di aplikasi Android: PDF langsung masuk folder Unduhan (Downloads). Buka lewat Files jika perlu.',
  pc: 'Di browser komputer: file .html masuk Unduhan/Downloads; cetak ke PDF dari browser jika perlu.',
  backupJson: 'Cadangan JSON dari Pengaturan juga masuk folder Unduhan (atau lokasi unduhan browser di PC).',
  jadwalPdf:
    'Jadwal: di Android unduh langsung PDF ke Unduhan; di PC gunakan cetak/Simpan sebagai PDF dari dialog.',
} as const;
