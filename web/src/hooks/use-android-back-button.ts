import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { Location, NavigateFunction } from 'react-router';
import { getScreenHeader } from '@/lib/screen-header';
import { isAppHubScreen, navigateScreenBack, normalizeAppPathname } from '@/lib/app-navigation';

/** Tangani tombol back fisik Android: navigasi dalam app, bukan langsung minimize. */
export function useAndroidBackButton(navigate: NavigateFunction, location: Location) {
  const locationRef = useRef(location);
  const navigateRef = useRef(navigate);
  locationRef.current = location;
  navigateRef.current = navigate;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    void App.addListener('backButton', () => {
      const loc = locationRef.current;
      const path = normalizeAppPathname(loc.pathname);
      const meta = getScreenHeader(path);

      if (meta && meta.showBack !== false && !isAppHubScreen(path)) {
        navigateScreenBack(navigateRef.current, loc, meta.backTo);
        return;
      }

      if (path !== '/') {
        navigateRef.current('/', { replace: true, state: null });
        return;
      }

      void App.minimizeApp();
    }).then((h) => {
      if (removed) {
        void h.remove();
        return;
      }
      listener = h;
    });

    return () => {
      removed = true;
      void listener?.remove();
    };
  }, []);
}
