import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { CalendarOff, CalendarRange, FileDown, Monitor, Plus, Smartphone, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyLoading, useReloadKeyReady } from '@/hooks/use-reload-key';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { toast } from '@/lib/toast';
import {
  jenisLabel,
  parsePenjadwalanJenisFromPath,
  type PenjadwalanJenis,
  type PenjadwalanPreset,
} from '@/lib/penjadwalan';
import {
  downloadPenjadwalanPdf,
  printPenjadwalanPdf,
  shouldOfferBrowserPrintFallback,
  type PenjadwalanPrintOrientation,
} from '@/lib/penjadwalan-print';
import { appFieldCompactClass } from '@/lib/form-styles';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { usePenjadwalanEnriched } from '@/pages/penjadwalan/use-penjadwalan-enriched';
import { useLocation } from 'react-router';

function todayMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function PenjadwalanDetail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const jenis = parsePenjadwalanJenisFromPath(pathname);
  const reload = useAppReload();
  const confirmDialog = useConfirmDialog();
  const jadwalReady = useReloadKeyReady('penjadwalan');
  const jadwalLoading = useReloadKeyLoading('penjadwalan');
  const settings = useAppStore((s) => s.settings);
  const presets = useAppStore((s) => s.penjadwalanPreset) as PenjadwalanPreset[];
  const enriched = usePenjadwalanEnriched();

  const [filterBulan, setFilterBulan] = useState(todayMonth);
  const [orientasiPdf, setOrientasiPdf] = useState<PenjadwalanPrintOrientation>('portrait');

  const preset = presets.find((p) => String(p.jenis) === jenis);

  const filtered = useMemo(() => {
    if (!jenis) return [];
    return enriched
      .filter((e) => e.jenis === jenis)
      .filter((e) => e.tanggal.startsWith(filterBulan))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }, [enriched, jenis, filterBulan]);

  const clearMutation = useMutation({
    mutationFn: async () => {
      if (!jenis) throw new Error('Jenis kosong');
      const res = await fetch('/api/penjadwalan/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis, bulan: filterBulan }),
      });
      if (!res.ok) throw new Error('clear failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Jadwal bulan ini berhasil dihapus');
      void reload('penjadwalan');
    },
    onError: () => toast.error('Gagal menghapus jadwal'),
  });

  const handleDownloadPdf = async () => {
    if (!jenis || filtered.length === 0) {
      toast.error('Tidak ada jadwal di bulan ini untuk diunduh.');
      return;
    }
    const options = {
      namaAsrama: settings.namaAsrama,
      jenis: jenis as PenjadwalanJenis,
      bulan: filterBulan,
      orientation: orientasiPdf,
      rows: filtered.map((r) => ({
        tanggal: r.tanggal,
        assignee_nama: r.assignee_nama,
        assignee_detail: r.assignee_detail,
        mode: r.mode,
      })),
    };
    const saved = await downloadPenjadwalanPdf(options);
    if (!saved && shouldOfferBrowserPrintFallback()) {
      printPenjadwalanPdf(options);
      toast.message('Dialog cetak dibuka — pilih Simpan sebagai PDF ke folder Unduhan.');
    }
  };

  const requestClearBulan = () => {
    confirmDialog.ask({
      title: 'Hapus jadwal bulan ini?',
      message: `Semua entri ${jenisLabel(jenis ?? '')} di ${filterBulan} akan dihapus.`,
      confirmLabel: 'Hapus',
      onConfirm: () => clearMutation.mutate(),
    });
  };

  if (!jenis) {
    return (
      <EmptyState icon={CalendarOff} title="Jenis jadwal tidak valid" variant="inline">
        <button type="button" className="text-emerald-700 font-semibold text-xs" onClick={() => navigate('/penjadwalan')}>
          Kembali ke penjadwalan
        </button>
      </EmptyState>
    );
  }

  if (jadwalLoading && !jadwalReady) {
    return <ListSkeleton rows={8} className="py-2" />;
  }

  return (
    <PageWithPullRefresh
      keys={['penjadwalan', 'penjadwalanPreset', 'santri', 'kamar']}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900">{jenisLabel(jenis)}</h2>
          {preset && (
            <p className="text-[11px] text-slate-500">
              {preset.mode === 'santri' ? 'Per santri' : 'Per kamar'} · mulai {preset.mulai} ·{' '}
              {preset.bulanKeDepan} bulan
            </p>
          )}
        </div>
        <input
          type="month"
          className={`${appFieldCompactClass} w-auto min-w-[9.5rem] shrink-0`}
          value={filterBulan}
          onChange={(e) => setFilterBulan(e.target.value)}
        />
      </div>

      {jenis && (
        <Button
          type="button"
          variant="outline"
          className="w-full border-emerald-200 text-emerald-800"
          onClick={() => navigate(`/penjadwalan/generate?jenis=${encodeURIComponent(jenis)}`)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Generate lagi
        </Button>
      )}

      <div className={cn(appCardClass, 'p-4 space-y-3')}>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <FileDown className="w-4 h-4 text-emerald-600" />
          Unduh PDF (A4)
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOrientasiPdf('portrait')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-sm text-xs font-bold border ${
              orientasiPdf === 'portrait'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 rotate-90" />
            Tegak
          </button>
          <button
            type="button"
            onClick={() => setOrientasiPdf('landscape')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-sm text-xs font-bold border ${
              orientasiPdf === 'landscape'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            Mendatar
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full border-emerald-200 text-emerald-800 hover:bg-emerald-50"
          disabled={filtered.length === 0}
          onClick={handleDownloadPdf}
        >
          <FileDown className="w-4 h-4 mr-2" />
          Simpan / Cetak PDF ({filtered.length} baris)
        </Button>
      </div>

      <button
        type="button"
        onClick={requestClearBulan}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-rose-600 border border-rose-200 rounded-sm hover:bg-rose-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Hapus jadwal bulan tampil
      </button>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="Belum ada jadwal di bulan ini"
            description="Generate jadwal atau pilih bulan lain."
            variant="inline"
          />
        ) : (
          filtered.map((row) => (
            <div
              key={row.id}
              className={cn(appCardClass, 'px-4 py-3 flex items-center justify-between gap-3')}
            >
              <div>
                <p className="text-xs text-slate-400">
                  {new Date(row.tanggal + 'T12:00:00').toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm font-bold text-slate-900">{row.assignee_nama}</p>
                {row.assignee_detail && (
                  <p className="text-[11px] text-slate-500">{row.assignee_detail}</p>
                )}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">
                {row.mode}
              </span>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onClose={confirmDialog.close}
        onConfirm={confirmDialog.confirm}
        loading={confirmDialog.loading}
        title={confirmDialog.request?.title}
        message={confirmDialog.request?.message ?? ''}
        confirmLabel={confirmDialog.request?.confirmLabel}
        cancelLabel={confirmDialog.request?.cancelLabel}
        destructive={confirmDialog.request?.destructive}
      />
    </PageWithPullRefresh>
  );
}
