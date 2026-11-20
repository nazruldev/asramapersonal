import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  ClockAlert,
  MessageCircle,
  Trash2,
} from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { useAppReload } from '@/hooks/use-app-reload';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { toast } from '@/lib/toast';
import {
  type IzinRow,
  formatIzinBatasKembali,
  isIzinBatasBelumPasti,
  isIzinTerlambat,
  parseIzinSantriIdFromPath,
} from '@/lib/izin-group';
import { appCardClass } from '@/lib/surface-styles';
import { cn } from '@/lib/utils';
import { useResolvedSantri } from '@/hooks/use-resolved-santri';

function formatIzinDateTime(value: string) {
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function IzinDetail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const santriId = parseIzinSantriIdFromPath(pathname);
  const reload = useAppReload();
  const confirmDialog = useConfirmDialog();
  const dataReady = useReloadKeyReady('izin');
  const izinList = useAppStore((s) => s.izin);
  const santriList = useAppStore((s) => s.santri);

  const kembaliMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/izin/${id}/kembali`, { method: 'PUT' });
      if (!res.ok) throw new Error('kembali failed');
    },
    onSuccess: () => {
      toast.success('Santri ditandai sudah kembali');
      void reload(['izin', 'dashboard']);
    },
    onError: () => toast.error('Gagal memperbarui status kembali'),
  });

  const deleteIzinMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/izin/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    },
    onSuccess: () => {
      toast.success('Data izin berhasil dihapus');
      void reload(['izin', 'dashboard']);
    },
    onError: () => toast.error('Gagal menghapus data izin'),
  });

  const { santri: resolvedSantri, displayName: resolvedName } = useResolvedSantri(santriId);
  const santri =
    resolvedSantri ??
    (santriList as { id: string; nama?: string; kelas?: string; kamar?: string }[]).find(
      (s) => String(s.id) === String(santriId)
    );

  const records = useMemo(() => {
    if (!santriId) return [];
    return (izinList as IzinRow[])
      .filter((i) => i.santri_id === santriId)
      .sort((a, b) => new Date(b.tanggal_keluar).getTime() - new Date(a.tanggal_keluar).getTime());
  }, [izinList, santriId]);

  const displayName =
    santri?.nama?.trim() || records[0]?.santri_nama?.trim() || resolvedName || 'Santri';
  const displayKelas = santri?.kelas || '-';
  const displayKamar = santri?.kamar || records[0]?.santri_kamar || '-';
  const activeIzin = records.find((r) => r.status_kembali === 'Belum') ?? null;

  if (!santriId) {
    return <EmptyState icon={CircleAlert} title="Halaman tidak valid" variant="inline" />;
  }

  return (
    <PageWithPullRefresh keys={['izin', 'santri', 'kamar', 'kelas']} className="space-y-4">
      <div className={cn(appCardClass, 'p-4 space-y-2')}>
        <h2 className="text-base font-bold text-slate-900 leading-snug">{displayName}</h2>
        <p className="text-[11px] text-slate-500">
          Kelas {displayKelas}
          {displayKamar && displayKamar !== '-' ? ` · ${displayKamar}` : ''}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
            {records.length} riwayat izin
          </span>
          {activeIzin ? (
            isIzinBatasBelumPasti(activeIzin.batas_kembali) ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                Sedang izin · belum pasti
              </span>
            ) : isIzinTerlambat(activeIzin) ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Sedang izin · terlambat
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Sedang izin
              </span>
            )
          ) : (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Di asrama
            </span>
          )}
        </div>
      </div>

      {!dataReady ? (
        <ListSkeleton rows={6} />
      ) : records.length === 0 ? (
        <EmptyState icon={ClockAlert} title="Belum ada riwayat izin">
          <button
            type="button"
            onClick={() => navigate('/laporan/izin')}
            className="text-[11px] font-semibold text-emerald-700"
          >
            Kembali ke daftar izin
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-500 px-0.5">Riwayat izin keluar (terbaru di atas)</p>
          {records.map((item) => {
            const isLate = isIzinTerlambat(item);
            const isReturned = item.status_kembali === 'Sudah';
            const cleanPhone = item.santri_wali ? item.santri_wali.replace(/[^0-9]/g, '') : '';
            const waNumber = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;

            return (
              <div
                key={item.id}
                className={cn(
                  appCardClass,
                  'p-4 space-y-3',
                  isLate && 'border-rose-300 bg-rose-50/20 dark:bg-rose-950/35 dark:border-rose-800/60'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      Alasan: <strong className="text-slate-800">{item.alasan}</strong>
                    </p>
                    {item.penjemput ? (
                      <p className="text-[11px] text-slate-400 mt-0.5">Penjemput: {item.penjemput}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isReturned ? (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Sudah Kembali
                      </span>
                    ) : isLate ? (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Terlambat
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        Sedang Izin
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        confirmDialog.ask({
                          message: `Hapus catatan izin "${item.alasan}"?`,
                          confirmLabel: 'Ya, Hapus',
                          onConfirm: () => deleteIzinMutation.mutateAsync(item.id),
                        })
                      }
                      className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                      title="Hapus izin"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-sm border border-slate-100">
                  <div>
                    <p className="text-slate-400 font-medium">Waktu Keluar</p>
                    <p className="font-bold text-slate-700 mt-0.5">{formatIzinDateTime(item.tanggal_keluar)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-medium">Batas Kembali</p>
                    <p className={`font-bold mt-0.5 ${isLate ? 'text-rose-600' : 'text-slate-700'}`}>
                      {formatIzinBatasKembali(item.batas_kembali)}
                    </p>
                  </div>
                  {isReturned && item.waktu_kembali_aktual ? (
                    <div className="col-span-2 pt-1 border-t border-slate-100">
                      <p className="text-slate-400 font-medium">Waktu kembali aktual</p>
                      <p className="font-bold text-emerald-700 mt-0.5">
                        {formatIzinDateTime(item.waktu_kembali_aktual)}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  {!isReturned ? (
                    <>
                      <button
                        type="button"
                        onClick={() => kembaliMutation.mutate(item.id)}
                        disabled={kembaliMutation.isPending}
                        className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-sm text-xs font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Tandai Sudah Kembali</span>
                      </button>
                      {waNumber && !isIzinBatasBelumPasti(item.batas_kembali) ? (
                        <a
                          href={`https://wa.me/${waNumber}?text=Assalamu%27alaikum%20Bapak%2FIbu%20Wali%20dari%20${encodeURIComponent(displayName)}.%20Mengingatkan%20bahwa%20batas%20kembali%20ke%20asrama%20adalah%20${encodeURIComponent(formatIzinBatasKembali(item.batas_kembali))}.%20Terima%20kasih.`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-sm font-bold text-xs active:scale-95 transition-all flex items-center gap-1 border border-emerald-200/60"
                          title="Kirim pengingat WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <div className="w-full flex items-center justify-between text-[11px] text-slate-400">
                      <span>Izin ini sudah selesai</span>
                      <span className="font-semibold text-emerald-700">Tuntas</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
