import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScreenHeaderMeta } from '@/lib/screen-header';

type Props = {
  meta: ScreenHeaderMeta;
  isScrolled: boolean;
  onBack: () => void;
  right?: ReactNode;
};

/** Header dalam halaman — mengikuti tema aplikasi (terang / gelap). */
export function AppScreenHeader({ meta, isScrolled, onBack, right }: Props) {
  const showBack = meta.showBack !== false;

  return (
    <header
      className={cn(
        'shrink-0 sticky top-0 z-50 flex items-center gap-0.5 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] transition-shadow duration-200 isolate',
        'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 border-b border-slate-300 dark:border-slate-500',
        showBack ? 'px-1' : 'pl-3 pr-1',
        isScrolled && 'shadow-sm dark:shadow-slate-950/50'
      )}
    >
      {showBack ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onBack();
          }}
          aria-label="Kembali"
          className="shrink-0 p-2.5 rounded-sm active:scale-95 transition-colors text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 touch-manipulation relative z-10"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
      ) : null}

      <div className="flex-1 min-w-0 py-1 pr-1">
        <h1 className="text-lg font-semibold leading-tight truncate tracking-tight">{meta.title}</h1>
      </div>

      {right ? (
        <div className="shrink-0 hidden sm:flex items-center justify-end relative z-10 touch-manipulation">{right}</div>
      ) : (
        <div className="w-2 shrink-0" aria-hidden />
      )}
    </header>
  );
}
