import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';
import { normalizeAppPathname } from '@/lib/app-navigation';

type RegisterFn = (
  id: symbol,
  content: ReactNode | null,
  matchesPath?: (pathname: string) => boolean
) => void;

type RegistryEntry = {
  content: ReactNode;
  matchesPath?: (pathname: string) => boolean;
};

const RegisterScreenHeaderActionsContext = createContext<RegisterFn | null>(null);

const ScreenHeaderActionsReadContext = createContext<ReactNode | null>(null);

type ActiveSlot = { id: symbol; content: ReactNode } | null;

function pickActiveSlot(
  registry: Map<symbol, RegistryEntry>,
  pathname: string
): ActiveSlot {
  if (registry.size === 0) return null;
  const entries = [...registry.entries()];
  const matching = entries.filter(([, entry]) => {
    if (!entry.matchesPath) return true;
    return entry.matchesPath(pathname);
  });
  const pool = matching.length > 0 ? matching : entries;
  const [id, entry] = pool[pool.length - 1]!;
  return { id, content: entry.content };
}

function slotsEqual(a: ActiveSlot, b: ActiveSlot): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.content === b.content;
}

export function ScreenHeaderActionsProvider({ children }: { children: ReactNode }) {
  const { pathname: rawPath } = useLocation();
  const pathname = normalizeAppPathname(rawPath);
  const registryRef = useRef(new Map<symbol, RegistryEntry>());
  const [actions, setActions] = useState<ReactNode | null>(null);
  const activeRef = useRef<ActiveSlot>(null);
  const flushScheduledRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const flushRegistry = useCallback(() => {
    const next = pickActiveSlot(registryRef.current, pathnameRef.current);
    if (slotsEqual(activeRef.current, next)) return;
    activeRef.current = next;
    setActions(next?.content ?? null);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    queueMicrotask(() => {
      flushScheduledRef.current = false;
      flushRegistry();
    });
  }, [flushRegistry]);

  const register = useCallback<RegisterFn>(
    (id, content, matchesPath) => {
      const registry = registryRef.current;
      if (content == null) {
        if (!registry.has(id)) return;
        registry.delete(id);
      } else {
        registry.set(id, { content, matchesPath });
      }
      scheduleFlush();
    },
    [scheduleFlush]
  );

  useEffect(() => {
    flushRegistry();
  }, [pathname, flushRegistry]);

  return (
    <RegisterScreenHeaderActionsContext.Provider value={register}>
      <ScreenHeaderActionsReadContext.Provider value={actions}>
        {children}
      </ScreenHeaderActionsReadContext.Provider>
    </RegisterScreenHeaderActionsContext.Provider>
  );
}

export function useScreenHeaderActionsSlot() {
  return useContext(ScreenHeaderActionsReadContext);
}

/** Set isi tombol/aksi kanan header; dibersihkan otomatis saat unmount. */
export function useScreenHeaderActions(
  content: ReactNode | null,
  deps: readonly unknown[],
  matchesPath?: (pathname: string) => boolean
) {
  const register = useContext(RegisterScreenHeaderActionsContext);
  const ownerIdRef = useRef<symbol | null>(null);
  if (ownerIdRef.current === null) {
    ownerIdRef.current = Symbol('screen-header-actions');
  }
  const ownerId = ownerIdRef.current;
  const { pathname: rawPath } = useLocation();
  const pathname = normalizeAppPathname(rawPath);
  const allowed = matchesPath ? matchesPath(pathname) : true;
  const effective = allowed ? content : null;

  useEffect(() => {
    if (!register) return;
    register(ownerId, effective, matchesPath);
    return () => register(ownerId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps disuplai pemanggil
  }, [register, ownerId, effective, matchesPath, ...deps]);
}
