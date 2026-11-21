import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';

export type ListRowAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

type Props = {
  title: string;
  subtitle?: string;
  actions: ListRowAction[];
  /** Label aksesibilitas tombol titik tiga */
  ariaLabel?: string;
  className?: string;
};

/**
 * Satu tombol ⋮ di baris list → bottom sheet aksi (edit/hapus/dll).
 * Pola sama di Kelas, Kamar, Kegiatan, Asrama, Pengguna, …
 */
export function ListRowActions({
  title,
  subtitle,
  actions,
  ariaLabel = 'Aksi',
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  const run = (action: ListRowAction) => {
    close();
    // Tutup sheet dulu agar fokus/overlay tidak menghalangi dialog berikutnya.
    queueMicrotask(() => action.onSelect());
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          'p-1.5 rounded-sm shrink-0 self-center transition-colors',
          'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
          'dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200',
          className
        )}
        title={ariaLabel}
        aria-label={ariaLabel}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[105] flex flex-col justify-end">
            <button
              type="button"
              aria-label="Tutup menu aksi"
              className="absolute inset-0 bg-black/50"
              onClick={close}
            />
            <div
              role="menu"
              className={cn(
                appCardClass,
                'relative w-full rounded-t-md shadow-2xl overflow-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                <p className="text-sm font-bold truncate text-slate-900 dark:text-white">
                  {title}
                </p>
                {subtitle ? (
                  <p className="text-[11px] truncate text-slate-500 dark:text-slate-400">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <div className="py-1">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    onClick={() => run(action)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:opacity-80',
                      action.destructive
                        ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-700'
                        : 'text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700'
                    )}
                  >
                    {action.icon ? (
                      <span className="shrink-0 w-4 h-4 flex items-center justify-center">
                        {action.icon}
                      </span>
                    ) : null}
                    {action.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={close}
                className="w-full py-3.5 text-sm font-semibold border-t border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Batal
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
