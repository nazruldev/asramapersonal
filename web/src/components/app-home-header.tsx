import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/app-logo';

type Props = {
  namaAsrama: string;
  dateStr: string;
  theme: 'light' | 'dark';
  isScrolled: boolean;
  onToggleTheme: () => void;
};

export function AppHomeHeader({
  namaAsrama,
  dateStr,
  theme,
  isScrolled,
  onToggleTheme,
}: Props) {
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
          <h1 className="text-sm font-semibold tracking-tight truncate max-w-full">{namaAsrama}</h1>
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

      <button
        type="button"
        onClick={onToggleTheme}
        className={cn(
          'p-2.5 rounded-full shrink-0 active:scale-95 transition-all',
          theme === 'dark'
            ? 'text-slate-300 hover:bg-slate-800'
            : 'text-slate-600 hover:bg-slate-100'
        )}
        title={theme === 'light' ? 'Mode gelap' : 'Mode terang'}
        aria-label={theme === 'light' ? 'Mode gelap' : 'Mode terang'}
      >
        {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
      </button>
    </header>
  );
}
