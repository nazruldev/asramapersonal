import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/app-logo';
import { AsramaSwitcher } from '@/components/asrama-switcher';
import { HeaderRefreshButton } from '@/components/header-refresh-button';
import {
  getSessionUser,
  subscribeSessionUser,
} from '@/lib/app-auth';
import { subscribeAsramaListChanged } from '@/lib/asrama-list-events';
import {
  countUnreadInAppNotifications,
  subscribeInAppNotifications,
} from '@/lib/in-app-notifications';
import type { Asrama } from '@/lib/app-settings';

type Props = {
  /** Fallback lama (nama sekolah/pondok) jika daftar asrama belum siap. */
  namaAsrama: string;
  dateStr: string;
  theme: 'light' | 'dark';
  isScrolled: boolean;
  onToggleTheme: () => void;
};

function resolveAsramaHeaderLabel(
  asramaList: Asrama[] | null,
  activeAsramaId: string | null | undefined,
  asramaIds: string[] | undefined,
  role: string | undefined,
  fallback: string
): string {
  const fallbackLabel = fallback.trim() || 'Asrama';
  if (!asramaList) return fallbackLabel;

  const dibatasi =
    role !== undefined && role !== 'super_admin' && (asramaIds?.length ?? 0) > 0;
  const options = dibatasi
    ? asramaList.filter((a) => asramaIds!.includes(a.id))
    : asramaList;

  if (options.length === 0) return fallbackLabel;
  if (options.length === 1) return options[0]!.nama;

  if (activeAsramaId) {
    return options.find((a) => a.id === activeAsramaId)?.nama ?? 'Asrama';
  }

  // Pengawas selalu terikat asrama tugas — jangan tampilkan "Semua asrama"
  if (role === 'pengawas') {
    return options[0]?.nama ?? fallbackLabel;
  }

  // Super admin / bendahara tanpa filter → semua asrama
  return 'Semua asrama';
}

export function AppHomeHeader({
  namaAsrama,
  dateStr,
  theme,
  isScrolled,
  onToggleTheme,
}: Props) {
  const navigate = useNavigate();
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  const [asramaList, setAsramaList] = useState<Asrama[] | null>(null);
  const [unread, setUnread] = useState(() => countUnreadInAppNotifications());

  useEffect(() => subscribeSessionUser(() => setSessionUser(getSessionUser())), []);
  useEffect(
    () => subscribeInAppNotifications(() => setUnread(countUnreadInAppNotifications())),
    []
  );

  useEffect(() => {
    let cancelled = false;
    const fetchList = () => {
      void fetch('/api/asrama')
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (!cancelled) setAsramaList(data as Asrama[]);
        })
        .catch(() => {
          if (!cancelled) setAsramaList([]);
        });
    };
    fetchList();
    const unsub = subscribeAsramaListChanged(fetchList);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const headerLabel = resolveAsramaHeaderLabel(
    asramaList,
    sessionUser?.activeAsramaId,
    sessionUser?.asramaIds,
    sessionUser?.role,
    namaAsrama
  );

  const iconBtnClass = cn(
    'p-2.5 rounded-full shrink-0 active:scale-95 transition-all',
    theme === 'dark'
      ? 'text-slate-300 hover:bg-slate-700'
      : 'text-slate-600 hover:bg-slate-200/80'
  );

  return (
    <header
      className={cn(
        'shrink-0 sticky top-0 z-40 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between transition-shadow duration-200 border-b',
        theme === 'dark'
          ? 'bg-slate-900 text-slate-50 border-slate-500'
          : 'bg-white text-slate-900 border-slate-300',
        isScrolled && 'shadow-sm'
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <AppLogo />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold tracking-tight truncate max-w-full">{headerLabel}</h1>
          <p
            className={cn(
              'text-[11px] font-medium capitalize mt-0.5 truncate',
              theme === 'dark' ? 'text-slate-300' : 'text-slate-500'
            )}
          >
            {dateStr}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'flex items-center shrink-0 rounded-full p-0.5',
          theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'
        )}
      >
        <AsramaSwitcher variant="icon" theme={theme} />
        <button
          type="button"
          onClick={() => navigate('/notifikasi')}
          className={cn(iconBtnClass, 'relative')}
          title="Notifikasi"
          aria-label={unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}
        >
          <Bell className="w-5 h-5" />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold leading-4 text-center">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
        <HeaderRefreshButton theme={theme} bindShortcut className={iconBtnClass} />
        <button
          type="button"
          onClick={onToggleTheme}
          className={iconBtnClass}
          title={theme === 'light' ? 'Mode gelap' : 'Mode terang'}
          aria-label={theme === 'light' ? 'Mode gelap' : 'Mode terang'}
        >
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
