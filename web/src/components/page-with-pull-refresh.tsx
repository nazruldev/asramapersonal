import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ReloadKey } from '@/store/app-store';

type Props = {
  keys?: ReloadKey[];
  children: ReactNode;
  className?: string;
  /** Diabaikan — refresh lewat tombol header. */
  extraRefresh?: () => Promise<void>;
  disabled?: boolean;
};

/**
 * Wrapper layout halaman.
 * Pull-to-refresh dihapus; muat ulang lewat tombol refresh di header.
 */
export function PageWithPullRefresh({ children, className }: Props) {
  return <div className={cn('w-full', className)}>{children}</div>;
}
