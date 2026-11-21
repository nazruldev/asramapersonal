import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';

/**
 * Update OTA untuk Android (Capacitor) dari GitHub Releases — tanpa server.
 *
 * Cara kerja: setiap GitHub Release menyertakan asset `dist.zip` (hasil
 * `npx @capgo/cli bundle zip` — jangan pakai Compress-Archive). App fetch
 * release terbaru lewat GitHub API, bandingkan tag versi dengan bundle aktif,
 * lalu download + aktifkan bundle baru.
 *
 * Capgo updater (>=8.x) wajib SHA256 checksum saat `download()`. Ambil dari
 * field `digest` asset GitHub API (`sha256:...`).
 */
const GITHUB_OWNER = 'nazruldev';
const GITHUB_REPO = 'asramapersonal';
const BUNDLE_ASSET_NAME = 'dist.zip';

const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  /** GitHub API: `sha256:<hex>` — tersedia sejak digest dihitung saat upload. */
  digest?: string | null;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubReleaseAsset[];
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
  return tag.replace(/^v/i, '').trim();
}

/** Parse "1.2.3" / "1.2.3-beta" → [major, minor, patch] (pre-release diabaikan untuk banding). */
function parseSemverParts(version: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(normalizeVersion(version));
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * true hanya jika remote lebih baru dari current (semver).
 * Hindari downgrade / tawaran ulang ke versi yang sama atau lebih lama.
 */
export function isRemoteNewer(remote: string, current: string): boolean {
  const a = parseSemverParts(remote);
  const b = parseSemverParts(current);
  if (!a || !b) return normalizeVersion(remote) !== normalizeVersion(current);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/** Versi bundle aktif: Capgo OTA, atau __APP_VERSION__ bila masih builtin APK. */
export async function getActiveBundleVersion(): Promise<string> {
  const buildVersion =
    typeof __APP_VERSION__ !== 'undefined' ? normalizeVersion(__APP_VERSION__) : '';
  if (!Capacitor.isNativePlatform()) return buildVersion || '0.0.0';
  try {
    const current = await CapacitorUpdater.current();
    const raw = current?.bundle?.version?.trim() ?? '';
    if (raw && raw.toLowerCase() !== 'builtin') return normalizeVersion(raw);
  } catch {
    /* fallback ke versi build di bawah */
  }
  return buildVersion || '0.0.0';
}

/** Ambil hex SHA256 dari field digest GitHub (`sha256:abc...` → `abc...`). */
function sha256FromDigest(digest: string | null | undefined): string | null {
  if (!digest) return null;
  const match = /^sha256:([0-9a-f]{64})$/i.exec(digest.trim());
  return match ? match[1].toLowerCase() : null;
}

/**
 * Wajib dipanggil sedini mungkin saat start (sebelum init berat).
 * Kalau terlambat / tidak dipanggil, Capgo rollback bundle OTA ke versi lama.
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
  /** SHA256 hex dari dist.zip — wajib untuk Capgo download. */
  checksum: string;
  /** URL asset .apk di release — dipakai fallback bila OTA gagal (mis. checksum tidak didukung bundle lama). */
  apkUrl: string | null;
}

/** URL stabil GitHub Releases (plugin Capgo mengikuti redirect HTTPS-nya). */
function releaseAssetUrl(tagName: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tagName}/${BUNDLE_ASSET_NAME}`;
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

  const checksum = sha256FromDigest(asset.digest);
  if (!checksum) {
    console.warn('OTA: asset dist.zip tanpa digest SHA256 dari GitHub API');
    return null;
  }

  // Banding semver (bukan === saja). Bundle Capgo "builtin" pakai __APP_VERSION__
  // dari APK — tanpa ini sheet selalu muncul & bisa "update" ke versi lebih lama.
  const active = await getActiveBundleVersion();
  if (!isRemoteNewer(version, active)) return null;

  // Jangan resolve ke URL signed (release-assets.githubusercontent.com):
  // token-nya kedaluwarsa ~1 jam — user yang klik "Perbarui" belakangan gagal unduh.
  // Pakai URL /releases/download/... yang stabil; Capgo native mengikuti redirect.
  const apkAsset = release.assets.find((a) => a.name.endsWith('.apk'));
  return {
    version,
    url: releaseAssetUrl(release.tag_name),
    checksum,
    apkUrl: apkAsset?.browser_download_url ?? null,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Download bundle OTA lalu aktifkan & reload app. Retry 1x untuk jaringan putus. */
export async function applyOtaUpdate(info: OtaUpdateInfo): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const bundle = await CapacitorUpdater.download({
        url: info.url,
        version: info.version,
        checksum: info.checksum,
      });
      // set() mengaktifkan bundle dan reload WebView — jangan panggil reload() lagi.
      await CapacitorUpdater.set(bundle);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`OTA download percobaan ${attempt + 1} gagal:`, err);
      if (attempt === 0) await sleep(1500);
    }
  }
  throw lastErr;
}

const APK_FILE_NAME = 'asrama-update.apk';

/**
 * Fallback bila OTA gagal (mis. bundle lama tanpa dukungan checksum):
 * unduh APK utuh dari asset release lalu buka installer Android.
 * Android akan minta izin "install aplikasi dari sumber ini" sekali.
 */
export async function downloadApkAndInstall(info: OtaUpdateInfo): Promise<void> {
  if (!info.apkUrl) throw new Error('Release tidak menyertakan file APK');
  await Filesystem.downloadFile({
    url: info.apkUrl,
    path: APK_FILE_NAME,
    directory: Directory.Cache,
  });
  const { uri } = await Filesystem.getUri({
    path: APK_FILE_NAME,
    directory: Directory.Cache,
  });
  await FileOpener.open({
    filePath: uri,
    contentType: 'application/vnd.android.package-archive',
  });
}

/** Pesan error yang bisa dibaca user untuk kegagalan OTA. */
export function otaErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!msg) return 'Gagal mengunduh update';
  const lower = msg.toLowerCase();
  if (lower.includes('checksum')) {
    return 'Verifikasi update gagal (checksum). Coba lagi atau hubungi pengelola.';
  }
  if (lower.includes('network') || lower.includes('internet') || lower.includes('connect')) {
    return 'Tidak ada koneksi internet. Coba lagi saat sinyal stabil.';
  }
  if (lower.includes('unzip') || lower.includes('index.html')) {
    return 'Paket update tidak valid. Hubungi pengelola aplikasi.';
  }
  return `Gagal mengunduh: ${msg.slice(0, 200)}`;
}
