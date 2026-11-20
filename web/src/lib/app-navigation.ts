import { Capacitor } from '@capacitor/core';
import type { NavigateFunction } from 'react-router';

/** State `location.state` untuk tombol kembali yang mengikuti asal navigasi */
export type AppNavigateState = {
  backTo?: string;
};

export function normalizeAppPathname(pathname: string): string {
  let path = pathname.split('#')[0].split('?')[0];
  if (path.startsWith('/index.html')) {
    path = path.slice('/index.html'.length) || '/';
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

export function withBackTo(backTo: string): { state: AppNavigateState } {
  return { state: { backTo } };
}

export function resolveScreenBackTo(
  pathname: string,
  fallbackBackTo: string,
  state: unknown
): string {
  const backTo = (state as AppNavigateState | null)?.backTo;
  if (backTo && typeof backTo === 'string') return backTo;
  return fallbackBackTo;
}

/** Root tab Izin & BK sesuai sub-halaman yang sedang dibuka */
export function izinBkTabRoot(pathname: string): string {
  if (pathname === '/laporan/pembinaan' || pathname.startsWith('/laporan/pembinaan/')) {
    return '/laporan/pembinaan';
  }
  return '/laporan/izin';
}

export function isIzinBkSubRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/laporan/izin/') ||
    pathname === '/laporan/pembinaan' ||
    pathname.startsWith('/laporan/pembinaan/')
  );
}

export function isMasterSubRoute(pathname: string): boolean {
  return pathname.startsWith('/master/') && pathname !== '/master';
}

/** Halaman utama yang punya bottom navigation (bukan sub / detail) */
const BOTTOM_NAV_ROOT_PATHS = new Set([
  '/',
  '/master',
  '/laporan',
  '/laporan/absensi',
  '/laporan/izin',
  '/laporan/pembinaan',
  '/laporan/peringkat',
  '/penjadwalan',
  '/pengaturan',
  '/database',
]);

export function showBottomNavigation(pathname: string): boolean {
  return BOTTOM_NAV_ROOT_PATHS.has(normalizeAppPathname(pathname));
}

/** Layar utama (tab bawah atau entri menu) — tanpa tombol kembali di header */
export function isAppHubScreen(pathname: string): boolean {
  return showBottomNavigation(normalizeAppPathname(pathname));
}

export function navigateScreenBack(
  navigate: NavigateFunction,
  location: { pathname: string; state: unknown },
  fallbackBackTo: string
) {
  const current = normalizeAppPathname(location.pathname);
  let target = normalizeAppPathname(
    resolveScreenBackTo(current, fallbackBackTo, location.state)
  );
  const fallback = normalizeAppPathname(fallbackBackTo);
  if (target === current && fallback && fallback !== current) {
    target = fallback;
  }

  if (current !== target) {
    navigate(target, { replace: true, state: null });
    return;
  }

  // Di WebView Android, history.back() sering minimize app — pakai target eksplisit.
  if (!Capacitor.isNativePlatform() && window.history.length > 1) {
    navigate(-1);
    return;
  }

  if (!isAppHubScreen(current) && fallbackBackTo) {
    navigate(normalizeAppPathname(fallbackBackTo), { replace: true, state: null });
    return;
  }

  navigate(target, { replace: true, state: null });
}
