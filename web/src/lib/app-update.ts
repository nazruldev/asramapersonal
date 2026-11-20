import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/**
 * Update OTA untuk Android (Capacitor) dari GitHub Releases — tanpa server.
 *
 * Cara kerja: setiap GitHub Release menyertakan asset `dist.zip` (hasil vite
 * build yang di-zip). App fetch release terbaru lewat GitHub API, bandingkan
 * tag versi dengan bundle aktif, lalu download + aktifkan bundle baru.
 * Update berlaku saat app dibuka ulang.
 */
const GITHUB_OWNER = 'nazruldev';
const GITHUB_REPO = 'asramapersonal';
const BUNDLE_ASSET_NAME = 'dist.zip';

const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

interface GithubRelease {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

async function fetchLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as GithubRelease;
  } catch {
    return null;
  }
}

function normalizeVersion(tag: string): string {
  return tag.replace(/^v/i, '');
}

/**
 * Wajib dipanggil sekali saat app selesai render pertama.
 * Memberi tahu Capgo bahwa bundle aktif berjalan baik; kalau tidak dipanggil,
 * bundle baru otomatis di-rollback ke versi sebelumnya.
 */
export async function notifyAppReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (err) {
    console.warn('notifyAppReady gagal:', err);
  }
}

export interface OtaUpdateInfo {
  version: string;
  url: string;
}

/** Cek GitHub Release terbaru; return info update kalau bundle lebih baru dari aktif. */
export async function checkOtaUpdateAvailable(): Promise<OtaUpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (!GITHUB_OWNER) return null;

  const release = await fetchLatestRelease();
  if (!release) return null;

  const version = normalizeVersion(release.tag_name);
  const asset = release.assets.find((a) => a.name === BUNDLE_ASSET_NAME);
  if (!asset) return null;

  try {
    const current = await CapacitorUpdater.current();
    if (current?.bundle?.version === version) return null;
  } catch {
    // Tetap tawarkan update kalau gagal baca versi aktif.
  }

  // browser_download_url GitHub me-redirect ke URL S3 signed; plugin download
  // tidak mengikuti redirect → resolve dulu ke URL final supaya zip-nya valid.
  let url = asset.browser_download_url;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.url && res.url !== url) url = res.url;
  } catch {
    // fallback ke url awal
  }
  return { version, url };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Download bundle OTA lalu aktifkan & reload app. Retry 1x untuk jaringan putus. */
export async function applyOtaUpdate(info: OtaUpdateInfo): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const bundle = await CapacitorUpdater.download({ url: info.url, version: info.version });
      await CapacitorUpdater.set(bundle);
      await CapacitorUpdater.reload();
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`OTA download percobaan ${attempt + 1} gagal:`, err);
      if (attempt === 0) await sleep(1500);
    }
  }
  throw lastErr;
}

/** Pesan error yang bisa dibaca user untuk kegagalan OTA. */
export function otaErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!msg) return 'Gagal mengunduh update';
  const lower = msg.toLowerCase();
  if (lower.includes('network') || lower.includes('internet') || lower.includes('connect')) {
    return 'Tidak ada koneksi internet. Coba lagi saat sinyal stabil.';
  }
  if (lower.includes('zip') || lower.includes('unzip') || lower.includes('index.html')) {
    return 'Paket update tidak valid. Hubungi pengelola aplikasi.';
  }
  return `Gagal mengunduh: ${msg.slice(0, 200)}`;
}
