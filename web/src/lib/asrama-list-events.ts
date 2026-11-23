/** Broadcast saat daftar asrama berubah (CRUD master), agar header/switcher refetch. */

const listeners = new Set<() => void>();

export function subscribeAsramaListChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAsramaListChanged(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
