/** Handler refresh per halaman — aman dengan KeepAlive (banyak page tetap mount). */

type PagePullRefreshHandler = () => Promise<void>;

type Entry = {
  handler: PagePullRefreshHandler;
  disabled: boolean;
};

const entries = new Map<string, Entry>();
/** Urutan aktif: yang terakhir di-set dianggap halaman terlihat. */
let activeId: string | null = null;

export function setPagePullRefresh(
  id: string,
  handler: PagePullRefreshHandler | null,
  disabled = false
): void {
  if (!handler) {
    entries.delete(id);
    if (activeId === id) {
      activeId = findLastId();
    }
    return;
  }
  entries.set(id, { handler, disabled });
  activeId = id;
}

export function activatePagePullRefresh(id: string): void {
  if (entries.has(id)) activeId = id;
}

function findLastId(): string | null {
  let last: string | null = null;
  for (const key of entries.keys()) last = key;
  return last;
}

export function getPagePullRefresh(): {
  handler: PagePullRefreshHandler | null;
  disabled: boolean;
} {
  if (!activeId) return { handler: null, disabled: true };
  const entry = entries.get(activeId);
  if (!entry) return { handler: null, disabled: true };
  return { handler: entry.handler, disabled: entry.disabled };
}
