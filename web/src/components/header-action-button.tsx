import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { appRadius } from '@/lib/ui-tokens';

const iconButtonClass = cn(
  'shrink-0 p-2.5 active:scale-95 transition-all inline-flex items-center justify-center',
  appRadius
);

type IconButtonProps = {
  onClick: () => void;
  'aria-label': string;
  className?: string;
  children: ReactNode;
};

export function HeaderIconButton({ onClick, 'aria-label': ariaLabel, className, children }: IconButtonProps) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={cn(iconButtonClass, className)}>
      {children}
    </button>
  );
}

type AddProps = {
  onClick: () => void;
  /** Untuk aria-label, mis. "Tambah santri" */
  label: string;
  className?: string;
  /** Tampilkan teks label di samping ikon (untuk desktop). */
  withLabel?: boolean;
};

/** Tombol tambah di header — ikon + saja, hijau, tanpa background. */
export function HeaderAddButton({ onClick, label, className, withLabel = false }: AddProps) {
  return (
    <HeaderIconButton
      onClick={onClick}
      aria-label={label}
      className={cn(
        'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-950/40',
        withLabel && 'gap-1 pr-3',
        className
      )}
    >
      <Plus className="w-5 h-5" strokeWidth={2.25} />
      {withLabel ? <span className="text-xs font-bold whitespace-nowrap">{label}</span> : null}
    </HeaderIconButton>
  );
}

type NeutralProps = {
  onClick: () => void;
  label: string;
  className?: string;
  /** Tampilkan teks label di semua ukuran layar (default: hanya mobile). */
  withLabel?: boolean;
  children: ReactNode;
};

export function HeaderNeutralButton({ onClick, label, className, withLabel = false, children }: NeutralProps) {
  return (
    <HeaderIconButton
      onClick={onClick}
      aria-label={label}
      className={cn('text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800', className)}
    >
      {children}
      <span
        className={cn(
          'text-[11px] sm:text-xs font-bold whitespace-nowrap ml-1',
          !withLabel && 'sm:hidden'
        )}
      >
        {label}
      </span>
    </HeaderIconButton>
  );
}
