/**
 * Kompres data-URL gambar (JPEG) agar avatar/foto santri tidak meledak
 * di WebView/Electron — data-URL multi-MB sering tampil sebagai broken image.
 */
export function compressImageDataUrl(
  dataUrl: string,
  maxSize = 512,
  quality = 0.82
): Promise<string> {
  const raw = dataUrl?.trim() ?? '';
  if (!raw.startsWith('data:image/')) {
    return Promise.reject(new Error('Bukan data URL gambar'));
  }
  // Sudah kecil — biarkan.
  if (raw.length <= 120_000) return Promise.resolve(raw);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk kompresi'));
    img.src = raw;
  });
}

/** Kompres jika terlalu besar; kalau gagal kembalikan asli. */
export async function maybeCompressImageDataUrl(
  dataUrl: string | null | undefined,
  maxSize = 512,
  quality = 0.82
): Promise<string> {
  const raw = dataUrl?.trim() ?? '';
  if (!raw) return '';
  if (raw.length <= 120_000) return raw;
  try {
    return await compressImageDataUrl(raw, maxSize, quality);
  } catch {
    return raw;
  }
}
