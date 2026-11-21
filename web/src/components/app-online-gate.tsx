import { CloudOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppLogo } from '@/components/app-logo';

type Props = {
  message?: string | null;
  onRetry: () => void;
  retrying?: boolean;
};

/** Full-online: blokir UI jika Turso / internet tidak tersedia. */
export function AppOnlineGate({
  message,
  onRetry,
  retrying = false,
}: Props) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="flex justify-center">
          <AppLogo size="md" />
        </div>
        <CloudOff className="mx-auto w-8 h-8 text-amber-600 dark:text-amber-400" />
        <div className="space-y-2">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Tidak bisa menyambung Turso
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Aplikasi hanya berjalan online. Sambungkan internet lalu coba lagi.
          </p>
          {message ? (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 break-words">{message}</p>
          ) : null}
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={retrying}
          onClick={onRetry}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Menyambung…' : 'Coba lagi'}
        </Button>
      </div>
    </div>
  );
}
