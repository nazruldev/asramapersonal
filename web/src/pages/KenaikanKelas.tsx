import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, GraduationCap, ArrowUpCircle, CheckSquare, Square, LogOut } from 'lucide-react';
import { useAppStore } from '@/store/app-store';
import { useAppReload } from '@/hooks/use-app-reload';
import { useReloadKeyReady } from '@/hooks/use-reload-key';
import { PageWithPullRefresh } from '@/components/page-with-pull-refresh';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BottomPicker } from '@/components/ui/bottom-picker';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/lib/use-confirm-dialog';
import { appCardClass } from '@/lib/surface-styles';
import { appLabelClass, appFieldClass } from '@/lib/form-styles';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

type SantriRow = { id: string; nama: string; kelas?: string; kamar?: string };
type KelasRow = { id: string; nama: string; tingkat?: string };

type Aksi = 'naik' | 'lulus' | 'keluar';

export default function KenaikanKelas() {
  const reload = useAppReload();
  const santriReady = useReloadKeyReady('santri');
  const kelasReady = useReloadKeyReady('kelas');
  const santriList = useAppStore((s) => s.santri) as SantriRow[];
  const kelasList = useAppStore((s) => s.kelas) as KelasRow[];

  const [kelasAsal, setKelasAsal] = useState('');
  const [targetKelas, setTargetKelas] = useState('');
  const [aksi, setAksi] = useState<Aksi>('naik');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<'asal' | 'tujuan' | null>(null);
  const confirmDialog = useConfirmDialog();

  const kelasAktif = useMemo(
    () => kelasList.filter((k) => k.nama !== 'Alumni' && k.nama !== 'Keluar'),
    [kelasList]
  );

  const santriKelasAsal = useMemo(
    () =>
      santriList
        .filter((s) => String(s.kelas ?? '') === kelasAsal)
        .sort((a, b) => a.nama.localeCompare(b.nama)),
    [santriList, kelasAsal]
  );

  const allChecked =
    santriKelasAsal.length > 0 &&
    santriKelasAsal.every((s) => selectedIds.has(s.id));

  const toggleAll = () => {
    setSelectedIds(allChecked ? new Set() : new Set(santriKelasAsal.map((s) => s.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const mutation = useMutation({
    mutationFn: async (payload: { santri_ids: string[]; aksi: Aksi; kelas?: string }) => {
      const res = await fetch('/api/santri/kenaikan-kelas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Gagal memproses');
      return data as { updated: number; skipped: number };
    },
    onSuccess: async (data) => {
      toast.success(`${data.updated} santri berhasil diproses`);
      if (data.skipped > 0) toast.error(`${data.skipped} santri dilewati`);
      setSelectedIds(new Set());
      await reload(['santri', 'kamar', 'kelas', 'dashboard']);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Gagal memproses'),
  });

  const handleSubmit = () => {
    if (!kelasAsal) {
      toast.error('Pilih kelas asal terlebih dahulu');
      return;
    }
    const ids = santriKelasAsal.filter((s) => selectedIds.has(s.id)).map((s) => s.id);
    if (!ids.length) {
      toast.error('Centang minimal satu santri');
      return;
    }
    if (aksi === 'naik' && !targetKelas) {
      toast.error('Pilih kelas tujuan terlebih dahulu');
      return;
    }
    const message =
      aksi === 'lulus'
        ? `Tandai ${ids.length} santri kelas ${kelasAsal} sebagai LULUS (Alumni)? Kamar mereka akan dikosongkan.`
        : aksi === 'keluar'
          ? `Tandai ${ids.length} santri kelas ${kelasAsal} sebagai KELUAR dari asrama? Kamar mereka akan dikosongkan.`
          : `Naikkan ${ids.length} santri dari kelas ${kelasAsal} ke kelas ${targetKelas}?`;
    confirmDialog.ask({
      title: 'Konfirmasi Kenaikan Kelas',
      message,
      confirmLabel: 'Ya, Proses',
      onConfirm: async () => {
        await mutation.mutateAsync({
          santri_ids: ids,
          aksi,
          kelas: aksi === 'naik' ? targetKelas : undefined,
        });
      },
    });
  };

  const asalOptions = kelasAktif.map((k) => ({
    value: k.nama,
    label: k.nama,
    sublabel: k.tingkat ? `Tingkat ${k.tingkat}` : undefined,
  }));

  const tujuanOptions = kelasAktif
    .filter((k) => k.nama !== kelasAsal)
    .map((k) => ({
      value: k.nama,
      label: k.nama,
      sublabel: k.tingkat ? `Tingkat ${k.tingkat}` : undefined,
    }));

  return (
    <PageWithPullRefresh keys={['santri', 'kelas', 'kamar']} className="space-y-3">
      <div className={cn(appCardClass, 'p-4 space-y-3')}>
        <div>
          <label className={appLabelClass}>Kelas Asal</label>
          <button
            type="button"
            onClick={() => setPicker('asal')}
            className={cn(appFieldClass, 'flex items-center justify-between text-left')}
          >
            <span className={kelasAsal ? '' : 'text-slate-400'}>
              {kelasAsal || 'Pilih kelas asal...'}
            </span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setAksi('naik')}
            className={cn(
              'p-3 rounded-lg border text-left transition-all',
              aksi === 'naik'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                : 'border-slate-200 dark:border-slate-700'
            )}
          >
            <ArrowUpCircle
              className={cn('w-5 h-5 mb-1', aksi === 'naik' ? 'text-emerald-600' : 'text-slate-400')}
            />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Naik Kelas</p>
            <p className="text-[10px] text-slate-500">Pindah ke kelas tujuan</p>
          </button>
          <button
            type="button"
            onClick={() => setAksi('lulus')}
            className={cn(
              'p-3 rounded-lg border text-left transition-all',
              aksi === 'lulus'
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40'
                : 'border-slate-200 dark:border-slate-700'
            )}
          >
            <GraduationCap
              className={cn('w-5 h-5 mb-1', aksi === 'lulus' ? 'text-violet-600' : 'text-slate-400')}
            />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Lulus</p>
            <p className="text-[10px] text-slate-500">Jadi Alumni, kamar dikosongkan</p>
          </button>
          <button
            type="button"
            onClick={() => setAksi('keluar')}
            className={cn(
              'p-3 rounded-lg border text-left transition-all',
              aksi === 'keluar'
                ? 'border-red-500 bg-red-50 dark:bg-red-950/40'
                : 'border-slate-200 dark:border-slate-700'
            )}
          >
            <LogOut
              className={cn('w-5 h-5 mb-1', aksi === 'keluar' ? 'text-red-600' : 'text-slate-400')}
            />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Keluar</p>
            <p className="text-[10px] text-slate-500">Keluar asrama, kamar dikosongkan</p>
          </button>
        </div>

        {aksi === 'naik' && (
          <div>
            <label className={appLabelClass}>Kelas Tujuan</label>
            <button
              type="button"
              onClick={() => setPicker('tujuan')}
              className={cn(appFieldClass, 'flex items-center justify-between text-left')}
            >
              <span className={targetKelas ? '' : 'text-slate-400'}>
                {targetKelas || 'Pilih kelas tujuan...'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        )}
      </div>

      {!santriReady || !kelasReady ? (
        <ListSkeleton rows={5} />
      ) : !kelasAsal ? (
        <EmptyState
          icon={GraduationCap}
          title="Pilih kelas asal"
          description="Santri yang tinggal kelas cukup tidak dicentang"
        />
      ) : santriKelasAsal.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={`Tidak ada santri di kelas ${kelasAsal}`}
          description="Pilih kelas lain"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 px-1"
          >
            {allChecked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {allChecked ? 'Batal pilih semua' : 'Pilih semua'} · {selectedIds.size}/{santriKelasAsal.length} dipilih
          </button>
          <div className="space-y-2">
            {santriKelasAsal.map((s) => {
              const checked = selectedIds.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleOne(s.id)}
                  className={cn(
                    appCardClass,
                    'w-full p-3 flex items-center gap-3 text-left transition-all',
                    checked
                      ? 'border-emerald-400 dark:border-emerald-600'
                      : 'opacity-60'
                  )}
                >
                  {checked ? (
                    <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                      {s.nama}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Kelas {s.kelas}
                      {s.kamar ? ` · ${s.kamar}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={mutation.isPending || selectedIds.size === 0}
            onClick={handleSubmit}
          >
            {aksi === 'lulus'
              ? `Proses Lulus (${selectedIds.size})`
              : aksi === 'keluar'
                ? `Proses Keluar (${selectedIds.size})`
                : `Naik ke Kelas ${targetKelas || '...'} (${selectedIds.size})`}
          </Button>
        </>
      )}

      <BottomPicker
        open={picker === 'asal'}
        onClose={() => setPicker(null)}
        title="Kelas Asal"
        options={asalOptions}
        value={kelasAsal}
        onSelect={(v) => {
          setKelasAsal(v);
          setTargetKelas('');
          setSelectedIds(
            new Set(
              santriList.filter((s) => String(s.kelas ?? '') === v).map((s) => s.id)
            )
          );
        }}
        searchPlaceholder="Cari kelas..."
      />
      <BottomPicker
        open={picker === 'tujuan'}
        onClose={() => setPicker(null)}
        title="Kelas Tujuan"
        options={tujuanOptions}
        value={targetKelas}
        onSelect={setTargetKelas}
        searchPlaceholder="Cari kelas..."
      />
      <ConfirmDialog
        open={confirmDialog.open}
        onClose={confirmDialog.close}
        onConfirm={confirmDialog.confirm}
        loading={confirmDialog.loading || mutation.isPending}
        title={confirmDialog.request?.title}
        message={confirmDialog.request?.message ?? ''}
        confirmLabel={confirmDialog.request?.confirmLabel}
        cancelLabel={confirmDialog.request?.cancelLabel}
        destructive={confirmDialog.request?.destructive}
      />
    </PageWithPullRefresh>
  );
}
