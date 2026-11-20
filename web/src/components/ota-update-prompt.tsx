import { useEffect, useState } from 'react';
import { DownloadCloud } from 'lucide-react';
import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { applyOtaUpdate, otaErrorMessage } from '@/lib/app-update';
import { useOtaUpdateCheck } from '@/lib/ota-update-check';
import { toast } from '@/lib/toast';

/**
 * Popup konfirmasi update OTA (Android/Capacitor).
 * Dicek saat app start & tiap pull-to-refresh — "Nanti" menutup,
 * dan prompt tampil lagi pada launch berikutnya sampai di-update.
 */
export function OtaUpdatePrompt() {
  const info = useOtaUpdateCheck((s) => s.info);
  const check = useOtaUpdateCheck((s) => s.check);
  const dismiss = useOtaUpdateCheck((s) => s.dismiss);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void check();
  }, [check]);

  const handleUpdate = async () => {
    if (!info) return;
    setBusy(true);
    try {
      await applyOtaUpdate(info);
      // reload() membuka bundle baru — kode di bawah jarang tercapai.
    } catch (err) {
      console.warn('OTA update gagal:', err);
      toast.error(otaErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AppModal
      open={info !== null}
      onClose={dismiss}
      title="Update tersedia"
      description={`Versi ${info?.version ?? ''} siap diunduh.`}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <DownloadCloud className="w-8 h-8 text-emerald-600 shrink-0" />
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {busy
              ? 'Mengunduh update, mohon tunggu…'
              : 'Perbarui aplikasi sekarang? Update berlaku langsung setelah diunduh.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={dismiss}
          >
            Nanti
          </Button>
          <Button type="button" className="flex-1" disabled={busy} onClick={() => void handleUpdate()}>
            {busy ? 'Mengunduh…' : 'Perbarui'}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
