import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type EmptyStateVariant = 'card' | 'inline' | 'minimal';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  variant?: EmptyStateVariant;
  dark?: boolean;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  variant = 'card',
  dark = false,
  className,
}: EmptyStateProps) {
  if (variant === 'minimal') {
    return (
      <div className={cn('flex flex-col items-center gap-1.5 py-3 text-center', className)}>
        <Icon className="w-6 h-6 text-slate-300 dark:text-slate-400" aria-hidden />
        <p className="text-[11px] text-muted-foreground">{title}</p>
        {description ? <p className="text-[10px] text-muted-foreground">{description}</p> : null}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'rounded-sm p-6 border text-center space-y-2',
          'bg-card text-card-foreground border-border',
          dark && 'bg-slate-800 border-slate-700',
          className
        )}
      >
        <Icon
          className={cn('w-8 h-8 mx-auto text-slate-300 dark:text-slate-400', dark && 'text-slate-400')}
          aria-hidden
        />
        <p className={cn('text-[11px] font-medium text-slate-600 dark:text-slate-300', dark && 'text-slate-300')}>
          {title}
        </p>
        {description ? (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-sm p-8 text-center border space-y-2',
        'bg-card text-card-foreground border-dashed border-border',
        dark && 'bg-slate-800 border-slate-700',
        className
      )}
    >
      <Icon
        className={cn('w-8 h-8 mx-auto text-slate-300 dark:text-slate-400', dark && 'text-slate-400')}
        aria-hidden
      />
      <p className={cn('text-xs font-bold text-slate-700 dark:text-slate-100', dark && 'text-slate-100')}>
        {title}
      </p>
      {description ? (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </div>
  );
}
