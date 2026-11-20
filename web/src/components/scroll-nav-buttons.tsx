import type { RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const btnClass =
  'w-6 h-6 rounded-sm border border-slate-300 dark:border-slate-500 bg-card items-center justify-center text-slate-500 hover:text-emerald-700 hover:border-emerald-400 active:scale-95 transition-all shrink-0 inline-flex';

type Props = {
  target: RefObject<HTMLElement | null>;
  className?: string;
};

/** Panah geser ‹ › untuk baris horizontal — hanya tampil di ≥sm. */
export function ScrollNavButtons({ target, className }: Props) {
  const scrollBy = (dir: 1 | -1) => {
    target.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });
  };
  return (
    <div className={cn('hidden sm:flex items-center gap-1 shrink-0', className)}>
      <button
        type="button"
        aria-label="Geser ke kiri"
        onClick={() => scrollBy(-1)}
        className={btnClass}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label="Geser ke kanan"
        onClick={() => scrollBy(1)}
        className={btnClass}
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
