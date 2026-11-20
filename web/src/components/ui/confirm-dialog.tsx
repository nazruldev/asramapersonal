import { AppModal } from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  className?: string;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Apakah Anda yakin?',
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  loading = false,
  destructive = true,
  className,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    void Promise.resolve(onConfirm());
  };

  return (
    <AppModal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      sheet={false}
      elevated
      className={className}
    >
      <div className="flex flex-col items-center text-center -mt-1">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
            destructive ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
          }`}
        >
          <AlertTriangle className="w-6 h-6" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed px-1">{message}</p>
      </div>
      <div className="flex gap-2 mt-5">
        <Button type="button" variant="outline" className="flex-1" disabled={loading} onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          className={`flex-1 ${destructive ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
          disabled={loading}
          onClick={handleConfirm}
        >
          {loading ? 'Memproses...' : confirmLabel}
        </Button>
      </div>
    </AppModal>
  );
}
