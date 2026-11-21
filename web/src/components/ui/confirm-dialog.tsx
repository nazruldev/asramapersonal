import { AppModal, AppModalFooter } from '@/components/ui/app-modal';
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
      footer={
        <AppModalFooter>
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-none"
            disabled={loading}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={`flex-1 rounded-none ${destructive ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
            disabled={loading}
            onClick={handleConfirm}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </Button>
        </AppModalFooter>
      }
    >
      <div className="flex flex-col items-center text-center -mt-1">
        <AlertTriangle
          className={`w-8 h-8 mb-3 ${
            destructive ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          }`}
        />
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed px-1">{message}</p>
      </div>
    </AppModal>
  );
}
