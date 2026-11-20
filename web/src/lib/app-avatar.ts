const AVATAR_PREFIX = 'asrama_manager_avatar_';

const listeners = new Set<() => void>();

export function subscribeAvatar(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyAvatarChanged(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function avatarStorageKey(userId: string | null | undefined): string {
  return `${AVATAR_PREFIX}${userId || 'admin'}`;
}

/** Avatar akun (data URL) disimpan lokal di perangkat ini. */
export function getAvatar(userId: string | null | undefined): string | null {
  try {
    return localStorage.getItem(avatarStorageKey(userId));
  } catch {
    return null;
  }
}

export function setAvatar(userId: string | null | undefined, dataUrl: string | null): void {
  try {
    if (dataUrl) localStorage.setItem(avatarStorageKey(userId), dataUrl);
    else localStorage.removeItem(avatarStorageKey(userId));
  } catch {
    /* ignore */
  }
  notifyAvatarChanged();
}

export function avatarInitials(nama: string | null | undefined): string {
  const parts = (nama ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/** Kompres foto ke data URL JPEG kecil agar muat di localStorage. */
export function fileToAvatarDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File bukan gambar'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas tidak tersedia'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
