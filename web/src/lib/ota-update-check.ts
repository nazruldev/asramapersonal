/**
 * Cek OTA update secara global — dipakai prompt saat start & saat refresh manual.
 * Throttle agar tidak spam GitHub API tiap refresh.
 */
import { create } from 'zustand';
import { checkOtaUpdateAvailable, type OtaUpdateInfo } from './app-update';

const MIN_CHECK_INTERVAL_MS = 60_000;

type OtaCheckState = {
  info: OtaUpdateInfo | null;
  checking: boolean;
  dismissedVersion: string | null;
  check: () => Promise<void>;
  dismiss: () => void;
};

let lastCheckAt = 0;

export const useOtaUpdateCheck = create<OtaCheckState>((set, get) => ({
  info: null,
  checking: false,
  dismissedVersion: null,

  check: async () => {
    if (get().checking) return;
    const nowTs = Date.now();
    if (nowTs - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
    lastCheckAt = nowTs;
    set({ checking: true });
    try {
      const info = await checkOtaUpdateAvailable();
      // Versi yang sama yang sudah di-dismiss jangan dimunculkan lagi sesi ini.
      if (info && info.version !== get().dismissedVersion) {
        set({ info });
      } else if (!info) {
        set({ info: null });
      }
    } catch {
      /* diam — dicek lagi di refresh berikutnya */
    } finally {
      set({ checking: false });
    }
  },

  dismiss: () => {
    const info = get().info;
    set({ info: null, dismissedVersion: info?.version ?? null });
  },
}));
