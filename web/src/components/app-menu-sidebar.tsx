import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import {
  LayoutDashboard,
  Database,
  CalendarCheck,
  ClockAlert,
  ShieldAlert,
  Trophy,
  MapPin,
  FileText,
  CalendarRange,
  Settings,
  HardDrive,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type MenuItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  badge?: number | null;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  namaAsrama: string;
  activeIzinCount: number;
};

function buildSections(activeIzinCount: number): MenuSection[] {
  return [
    {
      title: 'Utama',
      items: [
        {
          label: 'Beranda',
          path: '/',
          icon: LayoutDashboard,
          match: (p) => p === '/',
        },
      ],
    },
    {
      title: 'Kelola Data',
      items: [
        {
          label: 'Master Data',
          path: '/master',
          icon: Database,
          match: (p) => p === '/master' || p.startsWith('/master/'),
        },
      ],
    },
    {
      title: 'Operasional',
      items: [
        {
          label: 'Absensi Santri',
          path: '/laporan/absensi',
          icon: CalendarCheck,
          match: (p) => p === '/laporan/absensi',
        },
        {
          label: 'Izin Keluar',
          path: '/laporan/izin',
          icon: ClockAlert,
          match: (p) => p === '/laporan/izin',
          badge: activeIzinCount > 0 ? activeIzinCount : null,
        },
        {
          label: 'Pelanggaran & Teguran',
          path: '/laporan/pembinaan',
          icon: ShieldAlert,
          match: (p) => p === '/laporan/pembinaan' || p.startsWith('/laporan/pembinaan/'),
        },
        {
          label: 'Peringkat Santri',
          path: '/laporan/peringkat',
          icon: Trophy,
          match: (p) => p === '/laporan/peringkat',
        },
        {
          label: 'Sebaran Wilayah',
          path: '/laporan/wilayah',
          icon: MapPin,
          match: (p) => p === '/laporan/wilayah',
        },
        {
          label: 'Menu Laporan',
          path: '/laporan',
          icon: FileText,
          match: (p) => p === '/laporan',
        },
      ],
    },
    {
      title: 'Pengaturan & Lainnya',
      items: [
        {
          label: 'Penjadwalan',
          path: '/penjadwalan',
          icon: CalendarRange,
          match: (p) => p === '/penjadwalan' || p.startsWith('/penjadwalan/'),
        },
        {
          label: 'Pengaturan Asrama',
          path: '/pengaturan',
          icon: Settings,
          match: (p) => p === '/pengaturan',
        },
        {
          label: 'Cadangan data',
          path: '/database',
          icon: HardDrive,
          match: (p) => p === '/database',
        },
      ],
    },
  ];
}

export function AppMenuSidebar({ open, onClose, theme, namaAsrama, activeIzinCount }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const sections = buildSections(activeIzinCount);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Menu navigasi">
      <button
        type="button"
        aria-label="Tutup menu"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <aside
        className={cn(
          'absolute top-0 left-0 bottom-0 w-[min(84vw,272px)] max-w-full flex flex-col shadow-2xl',
          'animate-in slide-in-from-left duration-200',
          theme === 'dark' ? 'bg-slate-900 border-r border-slate-500' : 'bg-white border-r border-slate-300'
        )}
      >
        <div
          className={cn(
            'shrink-0 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 border-b flex items-center justify-between gap-2',
            theme === 'dark' ? 'border-slate-500 bg-emerald-950/40' : 'border-slate-100 bg-emerald-50/80'
          )}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 leading-none">
              Menu
            </p>
            <h2
              className={cn(
                'text-xs font-bold truncate mt-0.5 leading-snug',
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              )}
            >
              {namaAsrama}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'p-1.5 rounded-sm shrink-0 transition-colors',
              theme === 'dark'
                ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            )}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2 px-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {sections.map((section) => (
            <div key={section.title} className="mb-2.5 last:mb-0">
              <p
                className={cn(
                  'px-2 mb-0.5 text-[9px] font-bold uppercase tracking-wider',
                  theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                )}
              >
                {section.title}
              </p>
              <ul className="space-y-px">
                {section.items.map((item) => {
                  const active = item.match(location.pathname);
                  const Icon = item.icon;
                  return (
                    <li key={item.path}>
                      <button
                        type="button"
                        onClick={() => go(item.path)}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-left text-xs font-medium transition-colors',
                          active
                            ? theme === 'dark'
                              ? 'bg-emerald-900/50 text-emerald-300'
                              : 'bg-emerald-100 text-emerald-800'
                            : theme === 'dark'
                              ? 'text-slate-300 hover:bg-slate-800'
                              : 'text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0',
                            !active && (theme === 'dark' ? 'text-slate-400' : 'text-slate-500')
                          )}
                          strokeWidth={2.25}
                        />
                        <span className="flex-1 min-w-0 truncate leading-tight">{item.label}</span>
                        {item.badge != null && item.badge > 0 && (
                          <span className="min-w-[1.125rem] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </div>,
    document.body
  );
}

/** Routes mainly opened from sidebar (highlights Menu tab in bottom bar) */
export function isSidebarPrimaryRoute(pathname: string): boolean {
  return (
    pathname === '/pengaturan' ||
    pathname === '/penjadwalan' ||
    pathname.startsWith('/penjadwalan/') ||
    pathname === '/laporan' ||
    pathname === '/database'
  );
}
