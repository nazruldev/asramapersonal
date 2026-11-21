/**
 * Cek OTA update secara global — dipakai prompt saat start & saat pull-to-refresh.
 * Throttle agar tidak spam GitHub API tiap refresh.
 */
import { create } from 'zustand';
import { checkOtaUpdateAvailable, downloadOtaSilently, type OtaUpdateInfo } from './app-update';
import { toast } from './toast';

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
      if (info && info.version !== get().dismissedVersion) {
        // Silent OTA: unduh langsung di background, aktif saat launch berikutnya.
        // Kalau unduh gagal → jatuh ke popup konfirmasi (info di-set).
        try {
          await downloadOtaSilently(info);
          set({ info: null });
          toast.success(`Update v${info.version} terunduh — aktif saat aplikasi dibuka ulang`);
        } catch {
          set({ info });
        }
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
