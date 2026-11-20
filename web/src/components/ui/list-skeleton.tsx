import { cn } from '@/lib/utils';

type Props = {
  rows?: number;
  className?: string;
};

export function ListSkeleton({ rows = 6, className }: Props) {
  return (
    <div className={cn('space-y-2 animate-pulse', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-16 rounded-lg bg-slate-200/80 dark:bg-slate-800/80"
        />
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 animate-pulse', className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-slate-200/80 dark:bg-slate-800/80" />
      ))}
    </div>
  );
}
