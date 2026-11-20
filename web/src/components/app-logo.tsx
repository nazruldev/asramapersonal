import { cn } from '@/lib/utils';

type AppLogoProps = {
  className?: string;
  size?: 'sm' | 'md';
};

const sizeClass = {
  sm: 'w-10 h-10',
  md: 'w-11 h-11',
} as const;

/** Logo aplikasi (ikon di public/icon-192.png). */
export function AppLogo({ className, size = 'sm' }: AppLogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}icon-192.png`}
      alt=""
      width={192}
      height={192}
      className={cn(sizeClass[size], 'rounded-sm object-cover shrink-0 border border-slate-200/80 dark:border-slate-700', className)}
      decoding="async"
    />
  );
}
