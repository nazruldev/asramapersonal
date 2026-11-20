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

export type ScreenAddAction = { onClick: () => void; label: string };

type RegisterAddFn = (
  id: symbol,
  action: ScreenAddAction | null,
  matchesPath?: (pathname: string) => boolean
) => void;

const RegisterScreenAddActionContext = createContext<RegisterAddFn | null>(null);
const ScreenAddActionReadContext = createContext<ScreenAddAction | null>(null);

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
  const addRegistryRef = useRef(new Map<symbol, { action: ScreenAddAction; matchesPath?: (p: string) => boolean }>());
  const [actions, setActions] = useState<ReactNode | null>(null);
  const [addAction, setAddAction] = useState<ScreenAddAction | null>(null);
  const activeRef = useRef<ActiveSlot>(null);
  const activeAddRef = useRef<{ id: symbol; action: ScreenAddAction } | null>(null);
  const flushScheduledRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const flushRegistry = useCallback(() => {
    const next = pickActiveSlot(registryRef.current, pathnameRef.current);
    if (!slotsEqual(activeRef.current, next)) {
      activeRef.current = next;
      setActions(next?.content ?? null);
    }
    const addEntries = [...addRegistryRef.current.entries()].filter(([, e]) =>
      e.matchesPath ? e.matchesPath(pathnameRef.current) : true
    );
    const last = addEntries[addEntries.length - 1];
    const nextAdd = last ? { id: last[0], action: last[1].action } : null;
    const prev = activeAddRef.current;
    if (nextAdd?.id !== prev?.id || nextAdd?.action !== prev?.action) {
      activeAddRef.current = nextAdd;
      setAddAction(nextAdd?.action ?? null);
    }
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

  const registerAdd = useCallback<RegisterAddFn>(
    (id, action, matchesPath) => {
      const registry = addRegistryRef.current;
      if (action == null) {
        if (!registry.has(id)) return;
        registry.delete(id);
      } else {
        registry.set(id, { action, matchesPath });
      }
      scheduleFlush();
    },
    [scheduleFlush]
  );

  return (
    <RegisterScreenHeaderActionsContext.Provider value={register}>
      <RegisterScreenAddActionContext.Provider value={registerAdd}>
        <ScreenHeaderActionsReadContext.Provider value={actions}>
          <ScreenAddActionReadContext.Provider value={addAction}>
            {children}
          </ScreenAddActionReadContext.Provider>
        </ScreenHeaderActionsReadContext.Provider>
      </RegisterScreenAddActionContext.Provider>
    </RegisterScreenHeaderActionsContext.Provider>
  );
}

export function useScreenHeaderActionsSlot() {
  return useContext(ScreenHeaderActionsReadContext);
}

export function useScreenAddActionSlot() {
  return useContext(ScreenAddActionReadContext);
}

/**
 * Aksi "tambah" halaman — di mobile dirender sebagai tombol full-width
 * sticky di bawah; di ≥sm tampil sebagai ikon + di header.
 */
export function useScreenAddAction(
  action: ScreenAddAction | null,
  deps: readonly unknown[],
  matchesPath?: (pathname: string) => boolean
) {
  const register = useContext(RegisterScreenAddActionContext);
  const ownerIdRef = useRef<symbol | null>(null);
  if (ownerIdRef.current === null) {
    ownerIdRef.current = Symbol('screen-add-action');
  }
  const ownerId = ownerIdRef.current;
  const { pathname: rawPath } = useLocation();
  const pathname = normalizeAppPathname(rawPath);
  const allowed = matchesPath ? matchesPath(pathname) : true;
  const effective = allowed ? action : null;

  useEffect(() => {
    if (!register) return;
    register(ownerId, effective, matchesPath);
    return () => register(ownerId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps disuplai pemanggil
  }, [register, ownerId, effective, matchesPath, ...deps]);
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
