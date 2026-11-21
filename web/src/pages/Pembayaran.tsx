import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Edit2,
  MessageCircle,
  Receipt,
  Search,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListRowActions } from '@/components/list-row-actions';
import { AppModal, AppModalFooter } from '@/components/ui/app-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { useScreenAddAction } from '@/lib/screen-header-actions';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/lib/theme';
import {
  appFieldThemed,
  appLabelThemed,
  appSelectClass,
} from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { getSessionUser } from '@/lib/app-auth';
import type {
  PembayaranTransaksi,
  TagihanJenis,
  TagihanRow,
} from '@/lib/pembayaran-store';

type TagihanView = TagihanRow & {
  sisa: number;
  santri_nama: string;
  santri_kamar: string;
  santri_kelas: string;
  santri_wali: string;
};

type TunggakanRow = {
  santri_id: string;
  santri_nama: string;
  santri_kamar: string;
  santri_kelas: string;
  santri_wali: string;
  total_sisa: number;
  jumlah_tagihan: number;
  tagihan: TagihanView[];
};

type SantriRow = {
  id: string;
  nama?: string;
  kelas?: string;
  kamar?: string;
  asrama_id?: string;
};

type AsramaLite = { id: string; nama: string };

const rupiah = (n: number) =>
  `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n || 0)}`;

const bulanIni = () => new Date().toISOString().slice(0, 7);

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function labelPeriode(periode: string): string {
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (!m) return periode || '-';
  return `${NAMA_BULAN[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Format lokal YYYY-MM-DD (hindari geser hari karena UTC). */
function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Default jatuh tempo: 3 hari setelah akhir periode (bulan YYYY-MM), atau hari ini + 3. */
function defaultJatuhTempo(periode: string): string {
  const m = periode.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]); // 1–12
    const akhirBulan = new Date(year, month, 0); // hari terakhir bulan periode
    akhirBulan.setDate(akhirBulan.getDate() + 3);
    return toDateInputValue(akhirBulan);
  }
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return toDateInputValue(d);
}

function waLink(nomorWali: string, text: string): string | null {
  const clean = (nomorWali || '').replace(/[^0-9]/g, '');
  if (!clean) return null;
  const wa = clean.startsWith('0') ? `62${clean.slice(1)}` : clean;
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  belum: { label: 'Belum Bayar', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  sebagian: { label: 'Sebagian', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  lunas: { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

const PERIODE_JENIS_LABEL: Record<string, string> = {
  bulanan: 'Bulanan',
  sekali: 'Sekali',
  bebas: 'Bebas',
};

export default function Pembayaran() {
  const location = useLocation();
  const { theme } = useTheme();
  const santriList = useAppStore((s) => s.santri) as SantriRow[];
  const kelasList = useAppStore((s) => s.kelas) as { id: string; nama?: string }[];

  const [tab, setTab] = useState<'tagihan' | 'tunggakan' | 'jenis'>('tagihan');
  const [loading, setLoading] = useState(true);
  const [cloudReady, setCloudReady] = useState(false);
  const [jenis, setJenis] = useState<TagihanJenis[]>([]);
  const [tagihan, setTagihan] = useState<TagihanView[]>([]);
  const [tunggakan, setTunggakan] = useState<TunggakanRow[]>([]);

  // filter aktif (diterapkan)
  const [fPeriode, setFPeriode] = useState(bulanIni());
  const [fJenis, setFJenis] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [fJenisAktif, setFJenisAktif] = useState<'semua' | 'aktif' | 'nonaktif'>('semua');

  // draft filter di bottom sheet
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftPeriode, setDraftPeriode] = useState(bulanIni());
  const [draftJenis, setDraftJenis] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftJenisAktif, setDraftJenisAktif] = useState<'semua' | 'aktif' | 'nonaktif'>('semua');

  // modals
  const [showGenerate, setShowGenerate] = useState(false);
  const [showJenisForm, setShowJenisForm] = useState(false);
  const [editingJenis, setEditingJenis] = useState<TagihanJenis | null>(null);
  const [detailTagihan, setDetailTagihan] = useState<TagihanView | null>(null);

  const confirm = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fPeriode) params.set('periode', fPeriode);
      if (fJenis) params.set('jenis_id', fJenis);
      if (fStatus) params.set('status', fStatus);
      const [j, t, u] = await Promise.all([
        api<TagihanJenis[]>('/api/pembayaran/jenis'),
        api<TagihanView[]>(`/api/pembayaran/tagihan?${params}`),
        api<TunggakanRow[]>(`/api/pembayaran/tunggakan${fPeriode ? `?periode=${fPeriode}` : ''}`),
      ]);
      setJenis(j);
      setTagihan(t);
      setTunggakan(u);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memuat pembayaran');
    } finally {
      setLoading(false);
    }
  }, [fPeriode, fJenis, fStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/pembayaran/sync', { method: 'POST' });
        if (!res.ok) throw new Error('Gagal sync pembayaran dari Turso');
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Gagal sync pembayaran dari Turso');
        }
      } finally {
        if (!cancelled) setCloudReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cloudReady) return;
    void load();
  }, [cloudReady, load]);

  const isPembayaranScreen = location.pathname === '/master/pembayaran';
  const headerAddAction = useMemo(() => {
    if (!isPembayaranScreen) return null;
    if (tab === 'tagihan') {
      return { onClick: () => setShowGenerate(true), label: 'Buat Tagihan' };
    }
    if (tab === 'jenis') {
      return {
        onClick: () => {
          setEditingJenis(null);
          setShowJenisForm(true);
        },
        label: 'Tambah jenis',
      };
    }
    return null;
  }, [isPembayaranScreen, tab]);
  useScreenAddAction(headerAddAction, [headerAddAction]);

  const hasActiveFilter =
    tab === 'jenis'
      ? fJenisAktif !== 'semua'
      : Boolean(fPeriode !== bulanIni() || fJenis || (tab === 'tagihan' && fStatus));

  const openFilter = () => {
    setDraftPeriode(fPeriode);
    setDraftJenis(fJenis);
    setDraftStatus(fStatus);
    setDraftJenisAktif(fJenisAktif);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    if (tab === 'jenis') {
      setFJenisAktif(draftJenisAktif);
    } else {
      setFPeriode(draftPeriode);
      setFJenis(draftJenis);
      if (tab === 'tagihan') setFStatus(draftStatus);
    }
    setFilterOpen(false);
  };

  const resetFilters = () => {
    if (tab === 'jenis') {
      setDraftJenisAktif('semua');
      setFJenisAktif('semua');
    } else {
      const p = bulanIni();
      setDraftPeriode(p);
      setDraftJenis('');
      setDraftStatus('');
      setFPeriode(p);
      setFJenis('');
      setFStatus('');
    }
    setFilterOpen(false);
  };

  const filteredTagihan = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    if (!q) return tagihan;
    return tagihan.filter(
      (t) =>
        t.santri_nama.toLowerCase().includes(q) ||
        t.nama_jenis.toLowerCase().includes(q) ||
        t.santri_kamar.toLowerCase().includes(q)
    );
  }, [tagihan, fSearch]);

  const filteredTunggakan = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    if (!q) return tunggakan;
    return tunggakan.filter(
      (r) =>
        r.santri_nama.toLowerCase().includes(q) ||
        r.santri_kamar.toLowerCase().includes(q) ||
        r.santri_kelas.toLowerCase().includes(q)
    );
  }, [tunggakan, fSearch]);

  const filteredJenis = useMemo(() => {
    const q = fSearch.trim().toLowerCase();
    return jenis.filter((j) => {
      if (fJenisAktif === 'aktif' && !j.aktif) return false;
      if (fJenisAktif === 'nonaktif' && j.aktif) return false;
      if (!q) return true;
      return j.nama.toLowerCase().includes(q);
    });
  }, [jenis, fSearch, fJenisAktif]);

  const ringkasan = useMemo(() => {
    const total = tagihan.reduce((a, t) => a + t.nominal, 0);
    const terbayar = tagihan.reduce((a, t) => a + t.terbayar, 0);
    const lunas = tagihan.filter((t) => t.status === 'lunas').length;
    return { total, terbayar, sisa: Math.max(0, total - terbayar), lunas, count: tagihan.length };
  }, [tagihan]);

  const hapusJenis = async (id: string) => {
    try {
      await api(`/api/pembayaran/jenis/${id}`, { method: 'DELETE' });
      toast.success('Jenis pembayaran dihapus');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus');
    }
  };

  const hapusTagihan = async (id: string) => {
    try {
      await api(`/api/pembayaran/tagihan/${id}`, { method: 'DELETE' });
      toast.success('Tagihan dihapus');
      setDetailTagihan(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus');
    }
  };

  const isScreen = location.pathname === '/master/pembayaran';

  return (
    <PageWithPullRefresh keys={['santri']} extraRefresh={load} disabled={!isScreen} className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-sm bg-slate-200/60 dark:bg-slate-800">
        {([
          ['tagihan', 'Tagihan', Receipt],
          ['tunggakan', 'Tunggakan', CalendarClock],
          ['jenis', 'Jenis', Wallet],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setFSearch('');
            }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs font-semibold transition-all',
              tab === key
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Search tetap + filter di samping (seperti Izin/Absensi) */}
      <div className="flex gap-2 items-stretch">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
            placeholder={
              tab === 'jenis'
                ? 'Cari jenis pembayaran…'
                : tab === 'tunggakan'
                  ? 'Cari nama santri…'
                  : 'Cari santri / jenis…'
            }
            className={cn(appFieldThemed(theme), 'w-full pl-9 pr-8 shadow-xs text-xs')}
          />
          {fSearch ? (
            <button
              type="button"
              onClick={() => setFSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              aria-label="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={openFilter}
          aria-label="Buka filter"
          className={cn(
            'relative shrink-0 px-3 rounded-sm border shadow-xs flex items-center justify-center gap-1.5 text-xs font-bold transition-colors',
            hasActiveFilter
              ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'
          )}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filter</span>
          {hasActiveFilter ? (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-white dark:ring-slate-900" />
          ) : null}
        </button>
      </div>

      {hasActiveFilter ? (
        <p className="text-[11px] text-slate-500 px-0.5 leading-relaxed">
          Filter aktif:
          {tab === 'jenis'
            ? ` ${fJenisAktif === 'aktif' ? 'hanya aktif' : 'hanya nonaktif'}`
            : [
                fPeriode ? ` ${labelPeriode(fPeriode)}` : '',
                fJenis ? ` · ${jenis.find((j) => j.id === fJenis)?.nama ?? 'jenis'}` : '',
                tab === 'tagihan' && fStatus
                  ? ` · ${STATUS_META[fStatus]?.label ?? fStatus}`
                  : '',
              ].join('')}
        </p>
      ) : null}

      {loading ? (
        <ListSkeleton />
      ) : tab === 'tagihan' ? (
        <>
          <div className={cn(appCardClass, 'p-4 grid grid-cols-3 gap-3 text-center')}>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Total Tagihan</p>
              <p className="text-sm font-black text-slate-900 dark:text-slate-50 mt-0.5">{rupiah(ringkasan.total)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Terbayar</p>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{rupiah(ringkasan.terbayar)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Sisa</p>
              <p className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">{rupiah(ringkasan.sisa)}</p>
            </div>
          </div>

          {filteredTagihan.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Belum ada tagihan"
              description="Buat tagihan massal lewat tombol Buat Tagihan di bawah."
            />
          ) : (
            <div className="space-y-2">
              {filteredTagihan.map((t) => {
                const meta = STATUS_META[t.status] ?? STATUS_META.belum;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTagihan(t)}
                    className={cn(appCardClass, 'w-full p-3 text-left active:scale-[0.99] transition-all')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                          {t.santri_nama || 'Santri'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {t.nama_jenis} · {labelPeriode(t.periode)}
                          {t.santri_kamar ? ` · ${t.santri_kamar}` : ''}
                        </p>
                      </div>
                      <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold', meta.cls)}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-end justify-between mt-2">
                      <p className="text-sm font-black text-slate-900 dark:text-slate-50">{rupiah(t.nominal)}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Terbayar {rupiah(t.terbayar)}
                        {t.sisa > 0 ? ` · Sisa ${rupiah(t.sisa)}` : ''}
                      </p>
                    </div>
                    {t.nominal > 0 && (
                      <div className="h-1.5 mt-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            t.status === 'lunas' ? 'bg-emerald-500' : 'bg-amber-500'
                          )}
                          style={{ width: `${Math.min(100, Math.round((t.terbayar / t.nominal) * 100))}%` }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : tab === 'tunggakan' ? (
        filteredTunggakan.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Tidak ada tunggakan"
            description={
              fSearch
                ? 'Tidak ada hasil pencarian.'
                : `Semua tagihan ${labelPeriode(fPeriode)} sudah lunas.`
            }
          />
        ) : (
          <div className="space-y-2">
            {filteredTunggakan.map((r) => {
              const wa = waLink(
                r.santri_wali,
                `Assalamu'alaikum Bapak/Ibu Wali dari ${r.santri_nama}. Mengingatkan tagihan yang belum lunas sebesar ${rupiah(r.total_sisa)} (${r.jumlah_tagihan} tagihan). Mohon segera diselesaikan. Terima kasih.`
              );
              return (
                <div key={r.santri_id} className={cn(appCardClass, 'p-3')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                        {r.santri_nama}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {[r.santri_kelas, r.santri_kamar].filter(Boolean).join(' · ') || '-'}
                      </p>
                    </div>
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 p-2 rounded-sm bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all"
                        aria-label="Kirim WA ke wali"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-black text-rose-600 dark:text-rose-400">
                      {rupiah(r.total_sisa)}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {r.jumlah_tagihan} tagihan belum lunas
                    </p>
                  </div>
                  <div className="mt-2 space-y-1">
                    {r.tagihan.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setDetailTagihan(t)}
                        className="w-full flex items-center justify-between text-[11px] px-2 py-1.5 rounded-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        <span className="truncate">{t.nama_jenis} · {labelPeriode(t.periode)}</span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400 shrink-0 ml-2">
                          sisa {rupiah(t.sisa)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <>
          {filteredJenis.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title={jenis.length === 0 ? 'Belum ada jenis pembayaran' : 'Tidak ada hasil'}
              description={
                jenis.length === 0
                  ? 'Contoh: SPP Bulanan, Uang Makan, Laundry. Ketuk Tambah jenis di bawah.'
                  : 'Coba kata kunci lain atau reset filter.'
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredJenis.map((j) => (
                <div key={j.id} className={cn(appCardClass, 'p-3 flex items-center gap-3')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{j.nama}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {PERIODE_JENIS_LABEL[j.periode_jenis] ?? j.periode_jenis} · {rupiah(j.nominal_default)}
                      {!j.aktif ? ' · nonaktif' : ''}
                    </p>
                  </div>
                  <ListRowActions
                    title={j.nama}
                    subtitle={`${PERIODE_JENIS_LABEL[j.periode_jenis] ?? j.periode_jenis} · ${rupiah(j.nominal_default)}`}
                    actions={[
                      {
                        id: 'edit',
                        label: 'Ubah',
                        icon: <Edit2 className="w-4 h-4 text-blue-600" />,
                        onSelect: () => {
                          setEditingJenis(j);
                          setShowJenisForm(true);
                        },
                      },
                      {
                        id: 'delete',
                        label: 'Hapus',
                        icon: <Trash2 className="w-4 h-4" />,
                        destructive: true,
                        onSelect: () =>
                          confirm.ask({
                            title: 'Hapus jenis pembayaran?',
                            message: `"${j.nama}" akan dihapus. Tagihan yang sudah dibuat tetap tersimpan.`,
                            confirmLabel: 'Hapus',
                            destructive: true,
                            onConfirm: () => hapusJenis(j.id),
                          }),
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <AppModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter"
        description={
          tab === 'jenis'
            ? 'Saring jenis pembayaran'
            : tab === 'tunggakan'
              ? 'Saring tunggakan'
              : 'Saring tagihan'
        }
        footer={
          <AppModalFooter>
            <Button type="button" variant="outline" className="flex-1 text-xs" onClick={resetFilters}>
              Reset
            </Button>
            <Button type="button" className="flex-1 text-xs" onClick={applyFilters}>
              Terapkan
            </Button>
          </AppModalFooter>
        }
      >
        <div className="space-y-3 -mx-1">
          {tab === 'jenis' ? (
            <div>
              <label className={appLabelThemed(theme)}>Status jenis</label>
              <select
                value={draftJenisAktif}
                onChange={(e) =>
                  setDraftJenisAktif(e.target.value as 'semua' | 'aktif' | 'nonaktif')
                }
                className={appSelectClass}
              >
                <option value="semua">Semua</option>
                <option value="aktif">Aktif saja</option>
                <option value="nonaktif">Nonaktif saja</option>
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className={appLabelThemed(theme)}>Periode</label>
                <input
                  type="month"
                  value={draftPeriode}
                  onChange={(e) => setDraftPeriode(e.target.value)}
                  className={appFieldThemed(theme)}
                />
              </div>
              {tab === 'tagihan' ? (
                <>
                  <div>
                    <label className={appLabelThemed(theme)}>Jenis</label>
                    <select
                      value={draftJenis}
                      onChange={(e) => setDraftJenis(e.target.value)}
                      className={appSelectClass}
                    >
                      <option value="">Semua jenis</option>
                      {jenis.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={appLabelThemed(theme)}>Status</label>
                    <select
                      value={draftStatus}
                      onChange={(e) => setDraftStatus(e.target.value)}
                      className={appSelectClass}
                    >
                      <option value="">Semua status</option>
                      <option value="belum">Belum Bayar</option>
                      <option value="sebagian">Sebagian</option>
                      <option value="lunas">Lunas</option>
                    </select>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      </AppModal>

      <GenerateTagihanModal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        jenis={jenis}
        santri={santriList}
        kelas={kelasList}
        onNeedJenis={() => {
          setShowGenerate(false);
          setTab('jenis');
          setEditingJenis(null);
          setShowJenisForm(true);
        }}
        onDone={() => {
          setShowGenerate(false);
          void load();
        }}
      />

      <JenisFormModal
        open={showJenisForm}
        editing={editingJenis}
        onClose={() => setShowJenisForm(false)}
        onDone={() => {
          setShowJenisForm(false);
          void load();
        }}
      />

      <TagihanDetailModal
        tagihan={detailTagihan}
        onClose={() => setDetailTagihan(null)}
        onChanged={() => void load()}
        onDelete={(id) =>
          confirm.ask({
            title: 'Hapus tagihan?',
            message: 'Tagihan beserta riwayat cicilannya akan dihapus permanen.',
            confirmLabel: 'Hapus',
            destructive: true,
            onConfirm: () => hapusTagihan(id),
          })
        }
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.close}
        onConfirm={confirm.confirm}
        loading={confirm.loading}
        title={confirm.request?.title}
        message={confirm.request?.message ?? ''}
        confirmLabel={confirm.request?.confirmLabel}
        cancelLabel={confirm.request?.cancelLabel}
        destructive={confirm.request?.destructive}
      />
    </PageWithPullRefresh>
  );
}

// ——— Modal: generate tagihan massal ———

function GenerateTagihanModal({
  open,
  onClose,
  jenis,
  santri,
  kelas,
  onNeedJenis,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  jenis: TagihanJenis[];
  santri: SantriRow[];
  kelas: { id: string; nama?: string }[];
  onNeedJenis: () => void;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const [jenisId, setJenisId] = useState('');
  const [periode, setPeriode] = useState(bulanIni());
  const [lingkupAsrama, setLingkupAsrama] = useState<'semua' | 'pilih'>('semua');
  const [asramaList, setAsramaList] = useState<AsramaLite[]>([]);
  const [asramaIds, setAsramaIds] = useState<string[]>([]);
  const [target, setTarget] = useState<'semua' | 'kelas' | 'santri'>('semua');
  const [kelasIds, setKelasIds] = useState<string[]>([]);
  const [santriIds, setSantriIds] = useState<string[]>([]);
  const [santriQuery, setSantriQuery] = useState('');
  const [jatuhTempo, setJatuhTempo] = useState('');
  const [saving, setSaving] = useState(false);
  const [sudahAda, setSudahAda] = useState(0);

  const selectedJenis = jenis.find((j) => j.id === jenisId) ?? null;
  const periodeAktif =
    selectedJenis?.periode_jenis === 'bulanan' ? periode : periode.trim();
  const multiAsrama = asramaList.length > 1;

  useEffect(() => {
    if (!open) return;
    const p = bulanIni();
    setJenisId(jenis[0]?.id ?? '');
    setPeriode(p);
    setLingkupAsrama('semua');
    setAsramaIds([]);
    setTarget('semua');
    setKelasIds([]);
    setSantriIds([]);
    setSantriQuery('');
    setJatuhTempo(defaultJatuhTempo(p));
    setSudahAda(0);
    void fetch('/api/asrama')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const all = data as AsramaLite[];
        const user = getSessionUser();
        const dibatasi =
          user && user.role !== 'super_admin' && user.asramaIds.length > 0;
        setAsramaList(
          dibatasi ? all.filter((a) => user.asramaIds.includes(a.id)) : all
        );
      })
      .catch(() => setAsramaList([]));
  }, [open, jenis]);

  // Isi ulang default saat periode berubah (tetap bisa diubah manual setelahnya)
  useEffect(() => {
    if (!open || !periodeAktif) return;
    setJatuhTempo(defaultJatuhTempo(periodeAktif));
  }, [open, periodeAktif]);

  useEffect(() => {
    if (!open || !jenisId || !periodeAktif) {
      setSudahAda(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({
          jenis_id: jenisId,
          periode: periodeAktif,
        });
        const rows = await api<TagihanView[]>(`/api/pembayaran/tagihan?${params}`);
        if (!cancelled) setSudahAda(rows.length);
      } catch {
        if (!cancelled) setSudahAda(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, jenisId, periodeAktif]);

  const santriDalamLingkup = useMemo(() => {
    if (lingkupAsrama !== 'pilih' || !asramaIds.length) return santri;
    const set = new Set(asramaIds);
    return santri.filter((s) => !s.asrama_id || set.has(s.asrama_id));
  }, [santri, lingkupAsrama, asramaIds]);

  const filteredSantri = useMemo(() => {
    const q = santriQuery.trim().toLowerCase();
    const list = q
      ? santriDalamLingkup.filter(
          (s) =>
            (s.nama ?? '').toLowerCase().includes(q) ||
            (s.kelas ?? '').toLowerCase().includes(q) ||
            (s.kamar ?? '').toLowerCase().includes(q)
        )
      : santriDalamLingkup;
    return list.slice(0, 60);
  }, [santriDalamLingkup, santriQuery]);

  const toggle = (list: string[], id: string, set: (v: string[]) => void) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = async () => {
    if (!selectedJenis) {
      toast.error('Pilih jenis pembayaran dulu.');
      return;
    }
    if (lingkupAsrama === 'pilih' && !asramaIds.length) {
      toast.error('Pilih minimal satu asrama.');
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ created: number; skipped: number }>(
        '/api/pembayaran/tagihan/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jenis_id: selectedJenis.id,
            periode: periodeAktif,
            target: lingkupAsrama === 'pilih' && target === 'semua' ? 'asrama' : target,
            asrama_ids: lingkupAsrama === 'pilih' ? asramaIds : undefined,
            kelas_ids: kelasIds,
            santri_ids: santriIds,
            jatuh_tempo: jatuhTempo || undefined,
          }),
        }
      );
      if (result.created === 0 && result.skipped > 0) {
        toast.success(
          `Tidak ada tagihan baru. ${result.skipped} sudah ada — data bayar tetap aman, tidak diganti.`
        );
      } else {
        toast.success(
          `${result.created} tagihan baru dibuat${
            result.skipped
              ? ` · ${result.skipped} dilewati (sudah ada, termasuk yang sudah bayar)`
              : ''
          }`
        );
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat tagihan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Buat Tagihan Sekaligus"
      description="Tetap membuat tagihan baru untuk yang belum ada, skip yang sudah ada (termasuk sudah bayar). Bisa untuk semua asrama atau asrama tertentu."
      footer={
        jenis.length > 0 ? (
          <AppModalFooter>
            <Button onClick={submit} disabled={saving} className="w-full">
              {saving ? 'Membuat…' : 'Buat Tagihan'}
            </Button>
          </AppModalFooter>
        ) : (
          <AppModalFooter>
            <Button onClick={onNeedJenis} className="w-full">
              Buat Jenis Pembayaran
            </Button>
          </AppModalFooter>
        )
      }
    >
      {jenis.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Belum ada jenis pembayaran. Buat dulu jenisnya (mis. SPP, Uang Makan).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={appLabelThemed(theme)}>Jenis Pembayaran</label>
            <select value={jenisId} onChange={(e) => setJenisId(e.target.value)} className={appSelectClass}>
              {jenis.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nama} ({rupiah(j.nominal_default)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={appLabelThemed(theme)}>Periode</label>
              {selectedJenis?.periode_jenis === 'bulanan' ? (
                <input
                  type="month"
                  value={periode}
                  onChange={(e) => setPeriode(e.target.value)}
                  className={appFieldThemed(theme)}
                />
              ) : (
                <input
                  value={periode}
                  onChange={(e) => setPeriode(e.target.value)}
                  placeholder="mis. Semester 1 / Tahun 2026"
                  className={appFieldThemed(theme)}
                />
              )}
            </div>
            <div>
              <label className={appLabelThemed(theme)}>Jatuh Tempo</label>
              <input
                type="date"
                value={jatuhTempo}
                onChange={(e) => setJatuhTempo(e.target.value)}
                className={appFieldThemed(theme)}
              />
              <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                Default: 3 hari setelah akhir periode (bisa diubah).
              </p>
            </div>
          </div>

          {multiAsrama && (
            <div>
              <label className={appLabelThemed(theme)}>Lingkup Asrama</label>
              <div className="flex gap-1 p-1 rounded-sm bg-slate-200/60 dark:bg-slate-800">
                {([
                  ['semua', 'Semua asrama'],
                  ['pilih', 'Pilih asrama'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setLingkupAsrama(key);
                      if (key === 'semua') setAsramaIds([]);
                    }}
                    className={cn(
                      'flex-1 py-1.5 rounded-sm text-xs font-semibold transition-all',
                      lingkupAsrama === key
                        ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {lingkupAsrama === 'pilih' && (
                <div className="mt-2 max-h-36 overflow-y-auto space-y-1 rounded-sm border border-slate-200 dark:border-slate-700 p-2">
                  {asramaList.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 text-sm py-1 text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={asramaIds.includes(a.id)}
                        onChange={() => toggle(asramaIds, a.id, setAsramaIds)}
                        className="accent-emerald-600"
                      />
                      {a.nama}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {lingkupAsrama === 'semua'
                  ? 'Tagihan dibuat untuk santri di semua asrama yang Anda kelola.'
                  : 'Hanya santri di asrama yang dicentang.'}
              </p>
            </div>
          )}

          <div>
            <label className={appLabelThemed(theme)}>Ditagihkan Kepada</label>
            <div className="flex gap-1 p-1 rounded-sm bg-slate-200/60 dark:bg-slate-800">
              {([
                ['semua', multiAsrama && lingkupAsrama === 'semua' ? 'Semua santri' : 'Semua'],
                ['kelas', 'Per Kelas'],
                ['santri', 'Pilih Santri'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTarget(key)}
                  className={cn(
                    'flex-1 py-1.5 rounded-sm text-xs font-semibold transition-all',
                    target === key
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {target === 'kelas' && (
            <div className="max-h-40 overflow-y-auto space-y-1 rounded-sm border border-slate-200 dark:border-slate-700 p-2">
              {kelas.map((k) => (
                <label key={k.id} className="flex items-center gap-2 text-sm py-1 text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={kelasIds.includes(k.id)}
                    onChange={() => toggle(kelasIds, k.id, setKelasIds)}
                    className="accent-emerald-600"
                  />
                  {k.nama}
                </label>
              ))}
            </div>
          )}

          {target === 'santri' && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={santriQuery}
                  onChange={(e) => setSantriQuery(e.target.value)}
                  placeholder="Cari santri…"
                  className={cn(appFieldThemed(theme), 'pl-9')}
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-sm border border-slate-200 dark:border-slate-700 p-2">
                {filteredSantri.map((s) => {
                  const selected = santriIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm py-1 text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(santriIds, s.id, setSantriIds)}
                        className="accent-emerald-600 shrink-0"
                      />
                      <span className="truncate">
                        {s.nama}
                        <span className="text-[10px] text-slate-400 ml-1">
                          {[s.kelas, s.kamar].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {santriIds.length} santri dipilih · nominal mengikuti jenis pembayaran.
              </p>
            </div>
          )}

          {sudahAda > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug rounded-sm border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              Sudah ada {sudahAda} tagihan untuk jenis & periode ini. Saat dibuat ulang, yang sudah
              ada (termasuk sudah bayar) dilewati — tidak diganti.
            </p>
          )}
        </div>
      )}
    </AppModal>
  );
}

// ——— Modal: form jenis pembayaran ———

function JenisFormModal({
  open,
  editing,
  onClose,
  onDone,
}: {
  open: boolean;
  editing: TagihanJenis | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const [nama, setNama] = useState('');
  const [nominal, setNominal] = useState('');
  const [periodeJenis, setPeriodeJenis] = useState<'bulanan' | 'sekali' | 'bebas'>('bulanan');
  const [aktif, setAktif] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNama(editing?.nama ?? '');
    setNominal(editing ? String(editing.nominal_default || '') : '');
    setPeriodeJenis(editing?.periode_jenis ?? 'bulanan');
    setAktif(editing?.aktif !== false);
  }, [open, editing]);

  const submit = async () => {
    if (!nama.trim()) {
      toast.error('Nama wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/pembayaran/jenis/${editing.id}` : '/api/pembayaran/jenis';
      await api(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: nama.trim(),
          nominal_default: Number(nominal) || 0,
          periode_jenis: periodeJenis,
          aktif,
        }),
      });
      toast.success(editing ? 'Jenis diperbarui' : 'Jenis ditambahkan');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={editing ? 'Ubah Jenis Pembayaran' : 'Jenis Pembayaran Baru'}
      footer={
        <AppModalFooter>
          <Button onClick={submit} disabled={saving} className="w-full">
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </AppModalFooter>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={appLabelThemed(theme)}>Nama</label>
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="mis. SPP Bulanan, Uang Makan, Laundry"
            className={appFieldThemed(theme)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={appLabelThemed(theme)}>Nominal Bawaan</label>
            <input
              value={nominal}
              onChange={(e) => setNominal(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="0"
              className={appFieldThemed(theme)}
            />
          </div>
          <div>
            <label className={appLabelThemed(theme)}>Periode</label>
            <select
              value={periodeJenis}
              onChange={(e) => setPeriodeJenis(e.target.value as 'bulanan' | 'sekali' | 'bebas')}
              className={appSelectClass}
            >
              <option value="bulanan">Bulanan</option>
              <option value="sekali">Sekali</option>
              <option value="bebas">Bebas</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={aktif}
            onChange={(e) => setAktif(e.target.checked)}
            className="accent-emerald-600"
          />
          Aktif (bisa dipilih saat membuat tagihan)
        </label>
      </div>
    </AppModal>
  );
}

// ——— Modal: detail tagihan + cicilan ———

function TagihanDetailModal({
  tagihan,
  onClose,
  onChanged,
  onDelete,
}: {
  tagihan: TagihanView | null;
  onClose: () => void;
  onChanged: () => void;
  onDelete: (id: string) => void;
}) {
  const { theme } = useTheme();
  const [transaksi, setTransaksi] = useState<PembayaranTransaksi[]>([]);
  const [jumlah, setJumlah] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [catatan, setCatatan] = useState('');
  const [nominalEdit, setNominalEdit] = useState('');
  const [saving, setSaving] = useState(false);
  const confirm = useConfirmDialog();

  const loadTransaksi = useCallback(async () => {
    if (!tagihan) return;
    try {
      setTransaksi(await api<PembayaranTransaksi[]>(`/api/pembayaran/tagihan/${tagihan.id}/transaksi`));
    } catch {
      setTransaksi([]);
    }
  }, [tagihan]);

  useEffect(() => {
    setJumlah('');
    setTanggal(new Date().toISOString().slice(0, 10));
    setCatatan('');
    setNominalEdit(tagihan ? String(tagihan.nominal) : '');
    void loadTransaksi();
  }, [tagihan, loadTransaksi]);

  if (!tagihan) return null;
  const meta = STATUS_META[tagihan.status] ?? STATUS_META.belum;
  const sisa = Math.max(0, tagihan.nominal - tagihan.terbayar);

  const bayar = async (lunas = false) => {
    const n = lunas ? sisa : Number(jumlah);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Isi jumlah pembayaran.');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/pembayaran/tagihan/${tagihan.id}/bayar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jumlah: n, tanggal, catatan: catatan || undefined }),
      });
      toast.success('Pembayaran dicatat');
      setJumlah('');
      setCatatan('');
      await loadTransaksi();
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencatat pembayaran');
    } finally {
      setSaving(false);
    }
  };

  const simpanNominal = async () => {
    const n = Number(nominalEdit);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Nominal tidak valid.');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/pembayaran/tagihan/${tagihan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nominal: Math.floor(n) }),
      });
      toast.success('Nominal diperbarui');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui');
    } finally {
      setSaving(false);
    }
  };

  const hapusTransaksi = async (id: string) => {
    try {
      await api(`/api/pembayaran/transaksi/${id}`, { method: 'DELETE' });
      await loadTransaksi();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus');
    }
  };

  return (
    <AppModal
      open={Boolean(tagihan)}
      onClose={onClose}
      title={tagihan.nama_jenis}
      description={`${tagihan.santri_nama} · ${labelPeriode(tagihan.periode)}${tagihan.jatuh_tempo ? ` · Jatuh tempo ${tagihan.jatuh_tempo}` : ''}`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-sm bg-slate-100 dark:bg-slate-800 p-2">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Nominal</p>
            <p className="text-sm font-black text-slate-900 dark:text-slate-50">{rupiah(tagihan.nominal)}</p>
          </div>
          <div className="rounded-sm bg-slate-100 dark:bg-slate-800 p-2">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Terbayar</p>
            <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{rupiah(tagihan.terbayar)}</p>
          </div>
          <div className="rounded-sm bg-slate-100 dark:bg-slate-800 p-2">
            <p className="text-[10px] text-slate-500 uppercase font-semibold">Sisa</p>
            <p className="text-sm font-black text-rose-600 dark:text-rose-400">{rupiah(sisa)}</p>
          </div>
        </div>
        <div className="flex justify-center">
          <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold', meta.cls)}>{meta.label}</span>
        </div>

        {sisa > 0 && (
          <div className="space-y-2 rounded-sm border border-emerald-200 dark:border-emerald-800 p-3">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-50 flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Catat Pembayaran
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder={`Sisa ${rupiah(sisa)}`}
                className={appFieldThemed(theme)}
              />
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className={appFieldThemed(theme)}
              />
            </div>
            <input
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Catatan (opsional)"
              className={appFieldThemed(theme)}
            />
            <div className="flex gap-2">
              <Button onClick={() => void bayar(false)} disabled={saving} className="flex-1">
                Simpan Cicilan
              </Button>
              <Button
                variant="outline"
                onClick={() => void bayar(true)}
                disabled={saving}
                className="flex-1"
              >
                Lunasi ({rupiah(sisa)})
              </Button>
            </div>
          </div>
        )}

        {transaksi.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-slate-50 mb-1.5">Riwayat Pembayaran</p>
            <div className="space-y-1">
              {transaksi.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs px-2 py-1.5 rounded-sm bg-slate-100 dark:bg-slate-800"
                >
                  <span className="text-slate-600 dark:text-slate-300">
                    {p.tanggal}
                    {p.catatan ? ` · ${p.catatan}` : ''}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-50">{rupiah(p.jumlah)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        confirm.ask({
                          title: 'Hapus cicilan?',
                          message: `Pembayaran ${rupiah(p.jumlah)} akan dihapus.`,
                          confirmLabel: 'Hapus',
                          destructive: true,
                          onConfirm: () => hapusTransaksi(p.id),
                        })
                      }
                      className="text-rose-500 p-1"
                      aria-label="Hapus cicilan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-sm border border-slate-200 dark:border-slate-700 p-3">
          <p className="text-xs font-bold text-slate-900 dark:text-slate-50">Ubah Nominal Tagihan</p>
          <div className="flex gap-2">
            <input
              value={nominalEdit}
              onChange={(e) => setNominalEdit(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              className={appFieldThemed(theme)}
            />
            <Button variant="outline" onClick={simpanNominal} disabled={saving}>
              Simpan
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDelete(tagihan.id)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="w-3.5 h-3.5" /> Hapus Tagihan
        </button>
      </div>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.close}
        onConfirm={confirm.confirm}
        loading={confirm.loading}
        title={confirm.request?.title}
        message={confirm.request?.message ?? ''}
        confirmLabel={confirm.request?.confirmLabel}
        cancelLabel={confirm.request?.cancelLabel}
        destructive={confirm.request?.destructive}
      />
    </AppModal>
  );
}
