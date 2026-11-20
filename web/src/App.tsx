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
  PanelLeft,
} from 'lucide-react';
import { AppMenuSidebar, isSidebarPrimaryRoute } from './components/app-menu-sidebar';
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
import Kegiatan from './pages/Kegiatan';
import Pengaturan from './pages/Pengaturan';
import PenjadwalanList from './pages/PenjadwalanList';
import PenjadwalanGenerate from './pages/PenjadwalanGenerate';
import PenjadwalanDetail from './pages/PenjadwalanDetail';
import { useKeyboardInset } from './hooks/use-keyboard-inset';
import {
  ScreenHeaderActionsProvider,
  useScreenHeaderActionsSlot,
} from './lib/screen-header-actions';
import { AppBootLoading } from './components/app-boot-loading';
import { AppOnlineGate } from './components/app-online-gate';
import { toast } from './lib/toast';
import { useAndroidBackButton } from './hooks/use-android-back-button';
import { subscribeSyncStatus } from './lib/sync/turso-sync';

function AppShell() {
  useKeyboardInset();
  const headerRight = useScreenHeaderActionsSlot();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [unlocked, setUnlocked] = useState(() => isAuthenticatedSession());
  const [retryingCloud, setRetryingCloud] = useState(false);
  const [wentOffline, setWentOffline] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const hydrate = useAppStore((s) => s.hydrate);
  const retryCloudHydrate = useAppStore((s) => s.retryCloudHydrate);
  const reload = useAppStore((s) => s.reload);
  const hydrated = useAppStore((s) => s.hydrated);
  const settings = useAppStore((s) => s.settings);
  const initialLoading = useInitialAppLoading();
  const hydrateError = useAppStore((s) => s.hydrateError);
  const cloudBlocked = useAppStore((s) => s.cloudBlocked);
  const izinList = useAppStore((s) => s.izin);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrateError && !cloudBlocked) {
      toast.error(hydrateError);
    }
  }, [hydrateError, cloudBlocked]);

  useEffect(() => {
    if (!isTursoConfigured()) return;
    return subscribeSyncStatus((s) => {
      setWentOffline(s.configured && !s.online);
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
      name: 'Menu',
      path: '#',
      icon: PanelLeft,
      isActive: menuOpen || isSidebarPrimaryRoute(location.pathname),
      opensMenu: true,
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

  useAndroidBackButton(navigate, location);
  // Mode cloud (Turso): langsung login — wizard hanya jika tanpa cloud & lokal belum setup
  const setupDone = isTursoConfigured() || isSetupSelesai(settings);

  if (!hydrated || initialLoading) {
    return <AppBootLoading message={isTursoConfigured() ? 'Menyambung ke Turso…' : 'Memuat data…'} />;
  }

  if (isTursoConfigured() && (cloudBlocked || wentOffline)) {
    return (
      <AppOnlineGate
        message={hydrateError || (wentOffline ? 'Koneksi terputus.' : null)}
        retrying={retryingCloud}
        onRetry={() => {
          setRetryingCloud(true);
          void retryCloudHydrate()
            .then(() => setWentOffline(false))
            .finally(() => setRetryingCloud(false));
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
    return <AppLoginGate onSuccess={() => setUnlocked(true)} />;
  }

  return (
    <div className={`h-[100dvh] max-h-[100dvh] overflow-hidden selection:bg-emerald-500 selection:text-white font-sans antialiased ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-100'}`}>
      {/* Responsive shell: phone → tablet → desktop */}
      <div className={`w-full h-full max-h-[100dvh] flex flex-col relative mx-auto overflow-hidden ${theme === 'dark' ? 'bg-slate-900' : 'bg-slate-50'} max-w-full sm:max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl`}>
        
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
            right={headerRight}
          />
        ) : null}

        {/* Scrollable Main Content */}
        <main
          ref={mainContentRef}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 sm:px-4 py-4 scroll-smooth ${
            showBottomNav
              ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]'
              : 'pb-[calc(1rem+env(safe-area-inset-bottom))]'
          }`}
        >
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
              { path: '/master/kegiatan', match: (p) => p === '/master/kegiatan', element: <Kegiatan /> },
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
        </main>

        {showBottomNav ? (
          <nav
            aria-label="Navigasi Bawah"
            className={`shrink-0 z-50 w-full py-2 px-2 sm:px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-around shadow-[0_-6px_25px_rgba(0,0,0,0.08)] transition-colors ${
              theme === 'dark'
                ? 'bg-slate-900/95 backdrop-blur-xl border-t border-slate-500'
                : 'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-300 dark:border-slate-500'
            }`}
          >
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.isActive;

              return (
                <div key={tab.name} className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      if ('opensMenu' in tab && tab.opensMenu) {
                        setMenuOpen(true);
                        return;
                      }
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

        <AppMenuSidebar
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          theme={theme}
          namaAsrama={settings.namaAsrama}
          activeIzinCount={activeIzin.length}
        />

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
