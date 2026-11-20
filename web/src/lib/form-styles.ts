import { cn } from '@/lib/utils';
import { appRadius } from '@/lib/ui-tokens';

/** Tinggi sentuh ~44px, font 14px+ agar tidak zoom di iOS */
const controlBase = cn(
  'w-full min-w-0 max-w-full border outline-none transition-all text-sm leading-normal',
  appRadius
);

export const appLabelClass =
  'block text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug mb-1.5';

export const appHintClass = 'text-[11px] text-muted-foreground dark:text-slate-300 leading-relaxed mt-1';

export const appFieldClass = cn(
  controlBase,
  'h-11 px-3.5',
  'border-slate-300 bg-slate-50 text-slate-900 placeholder:text-slate-400',
  'focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20',
  'dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-400',
  'dark:focus:bg-slate-800 dark:focus:border-emerald-400'
);

export const appFieldCompactClass = cn(
  controlBase,
  'h-10 px-3',
  'border-slate-300 bg-slate-50 text-slate-900',
  'focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20',
  'dark:border-slate-500 dark:bg-slate-800 dark:text-slate-50',
  'dark:focus:bg-slate-800 dark:focus:border-emerald-400'
);

export const appSelectClass = cn(appFieldClass, 'appearance-none');

export const appTextareaClass = cn(
  appFieldClass,
  'h-auto min-h-[5.5rem] py-2.5 resize-none'
);

export const appPickerBtnClass = cn(
  appFieldClass,
  'inline-flex items-center justify-between gap-2 text-left font-normal hover:bg-white dark:hover:bg-slate-700'
);

export const appFormStack = 'space-y-1.5';

/** Dua kolom hanya jika layar cukup lebar — hindari datetime bertumpuk */
export const appFormGrid2 = 'grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 min-w-0';

export function appFieldThemed(theme: 'light' | 'dark', extra?: string) {
  return cn(
    appFieldClass,
    theme === 'dark'
      ? 'bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-500 focus:bg-slate-800'
      : '',
    extra
  );
}

export function appLabelThemed(theme: 'light' | 'dark') {
  return cn(
    appLabelClass,
    theme === 'dark' ? 'text-slate-300' : 'text-slate-700'
  );
}
