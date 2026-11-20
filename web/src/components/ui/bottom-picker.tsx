import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ClipboardList, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { appFieldClass } from '@/lib/form-styles';
import { BottomSheetFrame } from '@/components/ui/bottom-sheet-frame';

export type BottomPickerBadgeTone = 'amber' | 'violet' | 'slate';

export type BottomPickerOption = {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeTone?: BottomPickerBadgeTone;
};

const badgeToneClass: Record<BottomPickerBadgeTone, string> = {
  amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800',
  violet:
    'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800',
  slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
};

type BottomPickerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  options: BottomPickerOption[];
  value: string;
  onSelect: (value: string) => void;
  allowClear?: boolean;
  clearLabel?: string;
  searchPlaceholder?: string;
  /** Jika false, sheet tetap terbuka setelah memilih (mis. untuk konfirmasi lanjutan). */
  closeOnSelect?: boolean;
  /** Mode pilih banyak: values berisi daftar terpilih, onSelect dipanggil untuk toggle item. */
  multi?: boolean;
  values?: string[];
  /** Pencarian di server — opsi tidak difilter lagi di klien */
  remoteSearch?: boolean;
  onSearchQueryChange?: (query: string) => void;
};

export function BottomPicker({
  open,
  onClose,
  title,
  description,
  options,
  value,
  onSelect,
  allowClear,
  clearLabel = 'Kosongkan',
  searchPlaceholder = 'Cari...',
  closeOnSelect = true,
  multi = false,
  values,
  remoteSearch = false,
  onSearchQueryChange,
}: BottomPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!open) setSearchQuery('');
  }, [open]);

  useEffect(() => {
    if (!open || !remoteSearch) return;
    onSearchQueryChange?.(searchQuery);
  }, [searchQuery, open, remoteSearch, onSearchQueryChange]);

  const filteredOptions = useMemo(() => {
    if (remoteSearch) return options;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.sublabel?.toLowerCase().includes(q) ||
        opt.badge?.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q)
    );
  }, [options, searchQuery]);

  if (!open || typeof document === 'undefined') return null;

  const showClearInList = allowClear && !searchQuery.trim();

  return createPortal(
    <BottomSheetFrame open={open} onClose={onClose} elevated panelClassName="dark:bg-slate-800">
      <div className="flex items-start justify-between gap-2 px-4 pt-1 pb-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
          {description && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              appFieldClass,
              'pl-9 pr-8 bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200'
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <ul
        className="overflow-y-auto overscroll-contain flex-1 min-h-0 divide-y divide-slate-200 dark:divide-slate-700 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {showClearInList && (
          <li>
            <button
              type="button"
              onClick={() => {
                onSelect('');
                onClose();
              }}
              className={cn(
                'w-full text-left px-4 py-3 text-xs font-medium transition-colors',
                !value
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/80'
              )}
            >
              {clearLabel}
            </button>
          </li>
        )}
        {filteredOptions.length === 0 ? (
          <li>
            <EmptyState
              icon={searchQuery.trim() ? Search : ClipboardList}
              title={
                searchQuery.trim() ? 'Tidak ada hasil untuk pencarian ini' : 'Belum ada data di master'
              }
              variant="minimal"
            />
          </li>
        ) : (
          filteredOptions.map((opt) => {
            const selected = multi ? (values ?? []).includes(opt.value) : value === opt.value;
            return (
              <li key={opt.value || opt.label}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(opt.value);
                    if (closeOnSelect && !multi) onClose();
                  }}
                  className={cn(
                    'w-full text-left px-4 py-3 text-xs transition-colors flex items-center justify-between gap-2',
                    selected
                      ? 'bg-emerald-50 text-emerald-900 font-semibold dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/80'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {opt.badge ? (
                        <span
                          className={cn(
                            'shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border',
                            badgeToneClass[opt.badgeTone ?? 'slate']
                          )}
                        >
                          {opt.badge}
                        </span>
                      ) : null}
                    </span>
                    {opt.sublabel && (
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {opt.sublabel}
                      </span>
                    )}
                  </span>
                  {selected && <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                </button>
              </li>
            );
          })
        )}
      </ul>
      {multi && (
        <div className="px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-sm font-bold text-xs active:scale-[0.98] transition-all"
          >
            Selesai{(values?.length ?? 0) > 0 ? ` · ${values!.length} dipilih` : ''}
          </button>
        </div>
      )}
    </BottomSheetFrame>,
    document.body
  );
}
