import { useState, useEffect, useRef } from 'react';
import { AppLoginGate } from './components/app-login-gate';
import { AppSetupWizard } from './components/app-setup-wizard';
import { isAuthenticatedSession, markAuthenticated } from './lib/app-auth';
import { isSetupSelesai, markOnboardingComplete } from './lib/app-settings';
import { isTursoConfigured } from './lib/sync/cloud-bootstrap';
import { useLocation, useNavigate } from 'react-router';
import { 
  LayoutDashboard, 
  CalendarCheck, 
  ClockAlert, 
  Database,
  UserCircle2,
} from 'lucide-react';
import { AppHomeHeader } from './components/app-home-header';
import { AppScreenHeader } from './components/app-screen-header';
import { getScreenHeader } from './lib/screen-header';
import {
  isIzinBkSubRoute,
  isMasterSubRoute,
  izinBkTabRoot,
  showBottomNavigation,
  navigateScreenBack,
} from './lib/app-navigation';
import { useTheme } from './lib/theme';
import { useAppStore, useInitialAppLoading } from './store/app-store';
import { KeepAlivePages } from './components/keep-alive-pages';
import Dashboard from './pages/Dashboard';
import Santri from './pages/Santri';
import SantriDetail from './pages/SantriDetail';
import Kamar from './pages/Kamar';
import KamarDetail from './pages/KamarDetail';
import Absensi from './pages/Absensi';
import Izin from './pages/Izin';
import IzinDetail from './pages/IzinDetail';
import SantriKamarRiwayat from './pages/SantriKamarRiwayat';
import Pembinaan from './pages/Pembinaan';
import PembinaanDetail from './pages/PembinaanDetail';
import Master from './pages/Master';
import Laporan from './pages/Laporan';
import Peringkat from './pages/Peringkat';
import WilayahSebaran from './pages/WilayahSebaran';
import DatabasePage from './pages/Database';
import Kelas from './pages/Kelas';
import KenaikanKelas from './pages/KenaikanKelas';
import Kegiatan from './pages/Kegiatan';
import Pengaturan from './pages/Pengaturan';
import PenjadwalanList from './pages/PenjadwalanList';
import PenjadwalanGenerate from './pages/PenjadwalanGenerate';
import PenjadwalanDetail from './pages/PenjadwalanDetail';
import Pembayaran from './pages/Pembayaran';
import Asrama from './pages/Asrama';
import PenggunaPage from './pages/Pengguna';
import Profil from './pages/Profil';
import GantiAkun from './pages/GantiAkun';
import { RequireAkses } from './components/require-akses';
import { useKeyboardInset } from './hooks/use-keyboard-inset';
import { cn } from './lib/utils';
import {
  ScreenHeaderActionsProvider,
  useScreenHeaderActionsSlot,
  useScreenAddActionSlot,
} from './lib/screen-header-actions';
import { HeaderAddButton } from './components/header-action-button';
import { Plus } from 'lucide-react';
import { AppBootLoading } from './components/app-boot-loading';
import { AppOnlineGate } from './components/app-online-gate';
import { toast } from './lib/toast';
import { useAndroidBackButton } from './hooks/use-android-back-button';
import { subscribeSyncStatus } from './lib/sync/turso-sync';
import { ShellPullToRefresh } from './components/pull-to-refresh';

function AppShell() {
  useKeyboardInset();
  const headerRight = useScreenHeaderActionsSlot();
  const addAction = useScreenAddActionSlot();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isAuthenticatedSession());
  const shellRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const hydrate = useAppStore((s) => s.hydrate);
  const retryCloudHydrate = useAppStore((s) => s.retryCloudHydrate);
  const reload = useAppStore((s) => s.reload);
  const reloadAll = useAppStore((s) => s.reloadAll);
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrating = useAppStore((s) => s.hydrating);
  const cloudBlocked = useAppStore((s) => s.cloudBlocked);
  const settings = useAppStore((s) => s.settings);
  const initialLoading = useInitialAppLoading();
  const hydrateError = useAppStore((s) => s.hydrateError);
  const izinList = useAppStore((s) => s.izin);
  const offlineToastShown = useRef(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Setelah hydrate sukses: pull ulang (entity + pembayaran) lalu refresh store.
  useEffect(() => {
    if (!hydrated || cloudBlocked || !isTursoConfigured()) return;
    let cancelled = false;
    void (async () => {
      try {
        const { runTursoSync } = await import('@/lib/sync/turso-sync');
        await runTursoSync();
        const { pullPembayaranFromTurso } = await import('@/lib/pembayaran-store');
        await pullPembayaranFromTurso();
        if (!cancelled) await reloadAll();
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Gagal sync ulang setelah boot');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, cloudBlocked, reloadAll]);

  // Full-online: offline = error, bukan lanjut lokal.
  useEffect(() => {
    if (!isTursoConfigured()) return;
    return subscribeSyncStatus((s) => {
      if (s.configured && !s.online) {
        if (!offlineToastShown.current) {
          offlineToastShown.current = true;
          toast.error('Offline — aplikasi memerlukan koneksi ke Turso.');
        }
      } else if (s.online) {
        offlineToastShown.current = false;
      }
    });
  }, []);

  const isHome = location.pathname === '/';

  // Scroll spy for header shadow
  useEffect(() => {
    const handleScroll = () => {
      if (mainContentRef.current) {
        setIsScrolled(mainContentRef.current.scrollTop > 10);
      }
    };

    const mainContent = mainContentRef.current;
    if (mainContent) {
      mainContent.addEventListener('scroll', handleScroll);
      return () => mainContent.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const activeIzin = izinList.filter((i) => i.status_kembali === 'Belum');

  const isMasterRoute =
    location.pathname === '/master' || location.pathname.startsWith('/master/');

  const navTabs = [
    {
      name: 'Home',
      path: '/',
      icon: LayoutDashboard,
      isActive: location.pathname === '/',
    },
    {
      name: 'Kelola Data',
      path: '/master',
      icon: Database,
      isActive: isMasterRoute,
    },
    {
      name: 'Absensi',
      path: '/laporan/absensi',
      icon: CalendarCheck,
      isActive: location.pathname === '/laporan/absensi',
    },
    {
      name: 'Izin & BK',
      path: '/laporan/izin',
      icon: ClockAlert,
      badge: activeIzin.length > 0 ? activeIzin.length : null,
      isActive:
        location.pathname === '/laporan/izin' ||
        location.pathname.startsWith('/laporan/izin/') ||
        location.pathname === '/laporan/pembinaan' ||
        location.pathname.startsWith('/laporan/pembinaan/'),
    },
    {
      name: 'Profil',
      path: '/profil',
      icon: UserCircle2,
      isActive: location.pathname === '/profil',
    },
  ];

  // Indonesian current date
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(now);

  const screenHeader = getScreenHeader(location.pathname);
  const showBottomNav = showBottomNavigation(location.pathname);
  const showMobileAction = Boolean(
    (addAction || headerRight) && !isHome && screenHeader
  );
  const showAppFooter = showBottomNav || showMobileAction;

  useAndroidBackButton(navigate, location);
  // Mode cloud (Turso): langsung login — wizard hanya jika tanpa cloud & lokal belum setup
  const setupDone = isTursoConfigured() || isSetupSelesai(settings);

  if (!hydrated || initialLoading) {
    return <AppBootLoading message="Memuat dari Turso…" />;
  }

  if (cloudBlocked) {
    return (
      <AppOnlineGate
        message={hydrateError}
        retrying={hydrating}
        onRetry={() => {
          void retryCloudHydrate();
        }}
      />
    );
  }

  if (!setupDone) {
    return (
      <AppSetupWizard
        onComplete={() => {
          markOnboardingComplete();
          void reload(['settings', 'kelas']).then(() => {
            markAuthenticated();
            setUnlocked(true);
          });
        }}
      />
    );
  }

  if (!unlocked) {
    return (
      <AppLoginGate
        onSuccess={() => {
          setUnlocked(true);
          void reloadAll();
        }}
      />
    );
  }

  return (
    <div className={`h-[100dvh] max-h-[100dvh] overflow-hidden selection:bg-emerald-500 selection:text-white font-sans antialiased ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-100'}`}>
      {/* Responsive shell: phone → tablet → desktop */}
      <div
        ref={shellRef}
        className={`w-full h-full max-h-[100dvh] flex flex-col relative mx-auto overflow-hidden ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'} ${/Electron/.test(navigator.userAgent) ? 'max-w-none' : 'max-w-full sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl'}`}
      >
        <ShellPullToRefresh shellRef={shellRef} scrollRef={mainContentRef} />

        {isHome ? (
          <AppHomeHeader
            namaAsrama={settings.namaAsrama}
            dateStr={dateStr}
            theme={theme}
            isScrolled={isScrolled}
            onToggleTheme={toggleTheme}
          />
        ) : screenHeader ? (
          <AppScreenHeader
            meta={screenHeader}
            isScrolled={isScrolled}
            onBack={() => {
              if (screenHeader) {
                navigateScreenBack(navigate, location, screenHeader.backTo);
              }
            }}
            right={
              <>
                {addAction ? (
                  <HeaderAddButton
                    onClick={addAction.onClick}
                    label={addAction.label}
                    withLabel
                    className="hidden sm:inline-flex"
                  />
                ) : null}
                {headerRight}
              </>
            }
          />
        ) : null}

        {/* Scrollable Main Content */}
        <main
          ref={mainContentRef}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth ${
            isHome ? 'px-0 pt-0' : 'px-3 sm:px-4 py-4'
          } ${
            showBottomNav
              ? 'pb-4'
              : 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
          }`}
        >
          <RequireAkses>
          <KeepAlivePages
            routes={[
              {
                path: '/',
                match: (p) => p === '/',
                element: <Dashboard />,
              },
              { path: '/master', match: (p) => p === '/master', element: <Master /> },
              { path: '/master/santri', match: (p) => p === '/master/santri', element: <Santri /> },
              {
                path: '/master/santri/:santriId',
                match: (p) => /^\/master\/santri\/[^/]+$/.test(p),
                element: <SantriDetail />,
              },
              {
                path: '/master/santri/:santriId/kamar',
                match: (p) => /^\/master\/santri\/[^/]+\/kamar$/.test(p),
                element: <SantriKamarRiwayat />,
              },
              { path: '/master/kamar', match: (p) => p === '/master/kamar', element: <Kamar /> },
              {
                path: '/master/kamar/:kamarId',
                match: (p) => /^\/master\/kamar\/[^/]+$/.test(p),
                element: <KamarDetail />,
              },
              { path: '/master/kelas', match: (p) => p === '/master/kelas', element: <Kelas /> },
              {
                path: '/master/kenaikan-kelas',
                match: (p) => p === '/master/kenaikan-kelas',
                element: <KenaikanKelas />,
              },
              { path: '/master/kegiatan', match: (p) => p === '/master/kegiatan', element: <Kegiatan /> },
              { path: '/master/pembayaran', match: (p) => p === '/master/pembayaran', element: <Pembayaran /> },
              { path: '/master/asrama', match: (p) => p === '/master/asrama', element: <Asrama /> },
              { path: '/master/pengguna', match: (p) => p === '/master/pengguna', element: <PenggunaPage /> },
              { path: '/laporan', match: (p) => p === '/laporan', element: <Laporan /> },
              { path: '/laporan/absensi', match: (p) => p === '/laporan/absensi', element: <Absensi /> },
              { path: '/laporan/izin', match: (p) => p === '/laporan/izin', element: <Izin /> },
              {
                path: '/laporan/izin/:santriId',
                match: (p) => /^\/laporan\/izin\/[^/]+$/.test(p),
                element: <IzinDetail />,
              },
              { path: '/laporan/peringkat', match: (p) => p === '/laporan/peringkat', element: <Peringkat /> },
              { path: '/laporan/wilayah', match: (p) => p === '/laporan/wilayah', element: <WilayahSebaran /> },
              {
                path: '/laporan/pembinaan/:santriId',
                match: (p) => /^\/laporan\/pembinaan\/[^/]+$/.test(p),
                element: <PembinaanDetail />,
              },
              { path: '/laporan/pembinaan', match: (p) => p === '/laporan/pembinaan', element: <Pembinaan /> },
              { path: '/database', match: (p) => p === '/database', element: <DatabasePage /> },
              { path: '/pengaturan', match: (p) => p === '/pengaturan', element: <Pengaturan /> },
              { path: '/profil', match: (p) => p === '/profil', element: <Profil /> },
              { path: '/ganti-akun', match: (p) => p === '/ganti-akun', element: <GantiAkun /> },
              { path: '/penjadwalan', match: (p) => p === '/penjadwalan', element: <PenjadwalanList /> },
              {
                path: '/penjadwalan/generate',
                match: (p) => p === '/penjadwalan/generate',
                element: <PenjadwalanGenerate />,
              },
              {
                path: '/penjadwalan/jenis',
                match: (p) => p.startsWith('/penjadwalan/jenis/'),
                element: <PenjadwalanDetail />,
              },
            ]}
          />
          </RequireAkses>
        </main>

        {/* Footer bawah: aksi mobile + tab menu satu parent (tanpa gap) */}
        {showAppFooter ? (
          <div
            className={cn(
              'shrink-0 z-50 border-t',
              theme === 'dark'
                ? 'bg-slate-900 border-slate-500'
                : 'bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-500',
              !showBottomNav && 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            )}
          >
            {showMobileAction ? (
              <div className="sm:hidden px-3 pt-2 pb-0 flex items-center gap-2">
                {addAction ? (
                  <button
                    type="button"
                    onClick={addAction.onClick}
                    className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-sm bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-3 text-xs font-bold shadow-lg active:scale-[0.98] transition-all"
                  >
                    <Plus className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                    <span className="truncate">{addAction.label}</span>
                  </button>
                ) : null}
                {headerRight ? (
                  <div
                    className={cn(
                      'flex items-center gap-0.5 [&_button]:text-slate-700 dark:[&_button]:text-slate-200 [&_button]:justify-center',
                      addAction ? 'shrink-0' : 'flex-1 justify-center'
                    )}
                  >
                    {headerRight}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showBottomNav ? (
              <nav
                aria-label="Navigasi Bawah"
                className={cn(
                  'w-full px-2 sm:px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around',
                  showMobileAction &&
                    (theme === 'dark'
                      ? 'border-t border-slate-500'
                      : 'border-t border-slate-300 dark:border-slate-500')
                )}
              >
                {navTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = tab.isActive;

                  return (
                    <div key={tab.name} className="relative flex-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (tab.path === '/laporan/izin' && isIzinBkSubRoute(location.pathname)) {
                            navigate(izinBkTabRoot(location.pathname));
                            return;
                          }
                          if (tab.path === '/master' && isMasterSubRoute(location.pathname)) {
                            navigate('/master');
                            return;
                          }
                          navigate(tab.path);
                        }}
                        className={`w-full flex flex-col items-center justify-center py-1 rounded-sm transition-all relative active:scale-90 ${
                          active
                            ? theme === 'dark'
                              ? 'text-emerald-400 font-bold'
                              : 'text-emerald-700 font-bold'
                            : `${theme === 'dark' ? 'text-slate-400 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'} font-medium`
                        }`}
                      >
                        <div className="flex items-center justify-center py-0.5">
                          <Icon
                            className={`transition-all duration-200 ease-out ${
                              active ? 'w-[22px] h-[22px]' : 'w-[18px] h-[18px] opacity-80'
                            }`}
                            strokeWidth={active ? 2.25 : 2}
                          />
                        </div>

                        <span className="text-[10px] tracking-tight mt-1 leading-none">{tab.name}</span>

                        {tab.badge ? (
                          <span className="absolute top-0.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white font-bold text-[9px] flex items-center justify-center ring-2 ring-white dark:ring-slate-900">
                            {tab.badge}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </nav>
            ) : null}
          </div>
        ) : null}

      </div>
    </div>
  );
}

export default function App() {
  return (
    <ScreenHeaderActionsProvider>
      <AppShell />
    </ScreenHeaderActionsProvider>
  );
}
