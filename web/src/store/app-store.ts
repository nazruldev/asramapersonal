import { create } from 'zustand';
import { DEFAULT_APP_SETTINGS, mergeAppSettings, type AppSettings } from '@/lib/app-settings';
import { ensureClientApiDbLoaded } from '@/lib/client-api';
import { shouldPersistToSqlite } from '@/lib/offline-db';
import { bootstrapFromCloud } from '@/lib/sync/cloud-bootstrap';

export type EntityRow = Record<string, unknown> & { id: string };

export type DashboardStats = {
  totalSantri: number;
  sedangIzin: number;
  hadirTerakhir: number;
  kegiatanTerakhir: string;
  belumKembali: number;
  totalKapasitas: number;
  totalTerisi: number;
  sisaRanjang: number;
};

export type ReloadKey =
  | 'dashboard'
  | 'santri'
  | 'kamar'
  | 'kelas'
  | 'kegiatan'
  | 'penjadwalan'
  | 'penjadwalanPreset'
  | 'absensi'
  | 'izin'
  | 'pembinaan'
  | 'settings';

const ENDPOINTS: Record<ReloadKey, string> = {
  dashboard: '/api/dashboard',
  santri: '/api/santri',
  kamar: '/api/kamar',
  kelas: '/api/kelas',
  kegiatan: '/api/kegiatan',
  penjadwalan: '/api/penjadwalan',
  penjadwalanPreset: '/api/penjadwalan/presets',
  absensi: '/api/absensi',
  izin: '/api/izin',
  pembinaan: '/api/pembinaan',
  settings: '/api/settings',
};

const ALL_KEYS: ReloadKey[] = [
  'dashboard',
  'santri',
  'kamar',
  'kelas',
  'kegiatan',
  'penjadwalan',
  'penjadwalanPreset',
  'absensi',
  'izin',
  'pembinaan',
  'settings',
];

/** APK offline: jangan muat absensi/penjadwalan/pembinaan penuh di startup. */
const NATIVE_CORE_KEYS: ReloadKey[] = [
  'dashboard',
  'santri',
  'kamar',
  'kelas',
  'kegiatan',
  'penjadwalanPreset',
  'izin',
  'settings',
];

/** Tampilkan UI secepat mungkin; sisanya menyusul. */
const HYDRATE_CRITICAL_KEYS: ReloadKey[] = ['settings', 'dashboard', 'santri'];

const FETCH_TIMEOUT_MS = 90_000;
const HYDRATE_CRITICAL_TIMEOUT_MS = 25_000;

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Waktu habis memuat data (${url})`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    throw new Error(`Request failed: ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const head = text.trimStart().slice(0, 32).toLowerCase();
    if (head.startsWith('<!doctype') || head.startsWith('<html')) {
      throw new Error(
        'API tidak tersedia. Jalankan npm run dev (web) atau gunakan aplikasi Android yang sudah di-build.'
      );
    }
    throw new Error('Respons server tidak valid (bukan JSON).');
  }
}

type AppState = {
  hydrated: boolean;
  hydrating: boolean;
  hydrateError: string | null;
  /** Full-online Turso: boot cloud gagal / offline → UI diblok. */
  cloudBlocked: boolean;
  loadedKeys: Partial<Record<ReloadKey, boolean>>;
  loadingKeys: Partial<Record<ReloadKey, boolean>>;
  dashboard: DashboardStats | null;
  santri: EntityRow[];
  kamar: EntityRow[];
  kelas: EntityRow[];
  kegiatan: EntityRow[];
  penjadwalan: EntityRow[];
  penjadwalanPreset: EntityRow[];
  absensi: EntityRow[];
  izin: EntityRow[];
  pembinaan: EntityRow[];
  settings: AppSettings;
  hydrate: () => Promise<void>;
  retryCloudHydrate: () => Promise<void>;
  reload: (keys: ReloadKey | ReloadKey[]) => Promise<void>;
  reloadAll: () => Promise<void>;
};

let hydratePromise: Promise<void> | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  hydrating: false,
  hydrateError: null,
  cloudBlocked: false,
  loadedKeys: {},
  loadingKeys: {},
  dashboard: null,
  santri: [],
  kamar: [],
  kelas: [],
  kegiatan: [],
  penjadwalan: [],
  penjadwalanPreset: [],
  absensi: [],
  izin: [],
  pembinaan: [],
  settings: DEFAULT_APP_SETTINGS,

  hydrate: async () => {
    if (get().hydrated && !get().cloudBlocked) return;
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      set({ hydrating: true, hydrateError: null, cloudBlocked: false });
      const { setCloudWritesEnabled } = await import('@/lib/sync/turso-sync');
      setCloudWritesEnabled(false);
      try {
        await Promise.race([
          ensureClientApiDbLoaded(),
          new Promise<void>((resolve) => setTimeout(resolve, HYDRATE_CRITICAL_TIMEOUT_MS)),
        ]);

        // Full-online: Turso wajib; gagal → cloudBlocked.
        const { isTursoConfigured } = await import('@/lib/sync/cloud-bootstrap');
        if (!isTursoConfigured()) {
          throw new Error('Turso wajib. Isi VITE_TURSO_DATABASE_URL dan VITE_TURSO_AUTH_TOKEN.');
        }
        await bootstrapFromCloud();

        const criticalReload = get().reload(HYDRATE_CRITICAL_KEYS);
        await Promise.race([
          criticalReload,
          new Promise<void>((resolve) => setTimeout(resolve, HYDRATE_CRITICAL_TIMEOUT_MS)),
        ]);
        setCloudWritesEnabled(true);
        set({ hydrated: true, cloudBlocked: false, hydrateError: null });
        void criticalReload.catch((err) => {
          console.error('Critical reload after timeout:', err);
        });

        const bootstrapKeys = shouldPersistToSqlite() ? NATIVE_CORE_KEYS : ALL_KEYS;
        const nativeHeavy: ReloadKey[] = ['absensi', 'penjadwalan', 'pembinaan'];
        const deferred = [
          ...new Set([
            ...bootstrapKeys,
            ...(shouldPersistToSqlite() ? nativeHeavy : []),
          ]),
        ].filter((k) => !HYDRATE_CRITICAL_KEYS.includes(k));
        void get().reload(deferred).catch((err) => {
          console.error('Background data load:', err);
        });
      } catch (err) {
        console.error('Hydrate failed:', err);
        setCloudWritesEnabled(false);
        const message =
          err instanceof Error ? err.message : 'Gagal memuat data dari Turso.';
        set({
          hydrated: true,
          hydrateError: message,
          cloudBlocked: true,
        });
      } finally {
        set({ hydrating: false });
        hydratePromise = null;
      }
    })();

    return hydratePromise;
  },

  retryCloudHydrate: async () => {
    set({ hydrated: false, cloudBlocked: false, hydrateError: null });
    hydratePromise = null;
    await get().hydrate();
  },

  reload: async (keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    const unique = [...new Set(list)];

    set((state) => {
      const loadingKeys = { ...state.loadingKeys };
      for (const key of unique) loadingKeys[key] = true;
      return { loadingKeys };
    });

    const entries: (readonly [ReloadKey, unknown])[] = [];
    try {
      const results = await Promise.all(
        unique.map(async (key) => {
          try {
            const url = key === 'santri' ? `${ENDPOINTS.santri}?summary=1` : ENDPOINTS[key];
            const data = await fetchJson<unknown>(url);
            return { key, data } as const;
          } catch (err) {
            console.error(`reload ${key}:`, err);
            return null;
          }
        })
      );
      for (const row of results) {
        if (row) entries.push([row.key, row.data]);
      }
    } finally {
      set((state) => {
        const loadingKeys = { ...state.loadingKeys };
        const loadedKeys = { ...state.loadedKeys };
        for (const key of unique) {
          loadingKeys[key] = false;
          loadedKeys[key] = true;
        }
        return { loadingKeys, loadedKeys };
      });
    }

    const patch: Partial<AppState> = {};
    for (const [key, data] of entries) {
      switch (key) {
        case 'dashboard':
          patch.dashboard = data as DashboardStats;
          break;
        case 'settings':
          patch.settings = mergeAppSettings(data as AppSettings);
          break;
        default:
          (patch as Record<string, unknown>)[key] = data;
      }
    }
    set(patch);
  },

  reloadAll: async () => {
    const keys = shouldPersistToSqlite() ? NATIVE_CORE_KEYS : ALL_KEYS;
    await get().reload(keys);
  },
}));

/** Hanya loading skeleton pada muat pertama aplikasi */
export function useInitialAppLoading() {
  return useAppStore((s) => s.hydrating && !s.hydrated);
}
