import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BedDouble, Check, GraduationCap, Search } from 'lucide-react';
import { BottomSheetFrame } from '@/components/ui/bottom-sheet-frame';
import { AppModalFooter } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { appFieldClass } from '@/lib/form-styles';
import { cn } from '@/lib/utils';

type TabKey = 'kelas' | 'kamar';

type Props = {
  open: boolean;
  onClose: () => void;
  kelasOptions: string[];
  kamarOptions: string[];
  selectedKelas: string[];
  selectedKamar: string[];
  onApply: (kelas: string[], kamar: string[]) => void;
  onReset: () => void;
};

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Filter lanjutan kelas & kamar: tab + list scroll (bukan chip/tag),
 * tinggi sheet menyesuaikan konten (BottomSheetFrame).
 */
export function KelasKamarFilterSheet({
  open,
  onClose,
  kelasOptions,
  kamarOptions,
  selectedKelas,
  selectedKamar,
  onApply,
  onReset,
}: Props) {
  const [tab, setTab] = useState<TabKey>('kelas');
  const [draftKelas, setDraftKelas] = useState<string[]>([]);
  const [draftKamar, setDraftKamar] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraftKelas(selectedKelas);
    setDraftKamar(selectedKamar);
    setTab('kelas');
    setSearch('');
  }, [open, selectedKelas, selectedKamar]);

  const options = tab === 'kelas' ? kelasOptions : kamarOptions;
  const draft = tab === 'kelas' ? draftKelas : draftKamar;
  const setDraft = tab === 'kelas' ? setDraftKelas : setDraftKamar;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <BottomSheetFrame open={open} onClose={onClose} elevated panelClassName="dark:bg-slate-800">
      <div
        data-sheet-handle
        className="px-4 pt-1 pb-2 border-b border-slate-200 dark:border-slate-700 shrink-0 touch-none select-none"
      >
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Filter lanjutan
        </h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          Pilih satu atau lebih (kosong = semua)
          {(draftKelas.length > 0 || draftKamar.length > 0) && (
            <>
              {' · '}
              {draftKelas.length > 0 ? `${draftKelas.length} kelas` : ''}
              {draftKelas.length > 0 && draftKamar.length > 0 ? ' · ' : ''}
              {draftKamar.length > 0 ? `${draftKamar.length} kamar` : ''}
            </>
          )}
        </p>
      </div>

      <div className="px-4 pt-2 shrink-0">
        <div className="flex gap-1 p-1 rounded-sm bg-slate-200/60 dark:bg-slate-900/80">
          {(
            [
              ['kelas', 'Kelas', GraduationCap],
              ['kamar', 'Kamar', BedDouble],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setSearch('');
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs font-semibold transition-all',
                tab === key
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {(key === 'kelas' ? draftKelas : draftKamar).length > 0 ? (
                <span className="min-w-[1.1rem] h-4 px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {(key === 'kelas' ? draftKelas : draftKamar).length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'kelas' ? 'Cari kelas…' : 'Cari kamar…'}
            className={cn(appFieldClass, 'pl-9 pr-3 text-xs')}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-1">
        {filtered.length === 0 ? (
          <div className="py-6">
            <EmptyState
              icon={tab === 'kelas' ? GraduationCap : BedDouble}
              title={options.length === 0 ? `Belum ada data ${tab}` : 'Tidak ada hasil'}
              description={
                options.length === 0
                  ? 'Tambah data di menu Master terlebih dahulu.'
                  : 'Coba kata kunci lain.'
              }
              variant="minimal"
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/80">
            {filtered.map((item) => {
              const active = draft.includes(item);
              return (
                <li key={item}>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => toggle(prev, item))}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-3 text-left text-sm transition-colors',
                      active
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    )}
                  >
                    <span
                      className={cn(
                        'w-5 h-5 rounded-sm border flex items-center justify-center shrink-0',
                        active
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 dark:border-slate-500'
                      )}
                    >
                      {active ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : null}
                    </span>
                    <span
                      className={cn(
                        'flex-1 min-w-0 font-semibold truncate',
                        active
                          ? 'text-emerald-900 dark:text-emerald-100'
                          : 'text-slate-800 dark:text-slate-100'
                      )}
                    >
                      {item}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AppModalFooter>
        <Button
          type="button"
          variant="outline"
          className="flex-1 text-xs"
          onClick={() => {
            setDraftKelas([]);
            setDraftKamar([]);
            onReset();
          }}
        >
          Reset filter
        </Button>
        <Button
          type="button"
          className="flex-1 text-xs"
          onClick={() => onApply(draftKelas, draftKamar)}
        >
          Terapkan
        </Button>
      </AppModalFooter>
    </BottomSheetFrame>,
    document.body
  );
}
