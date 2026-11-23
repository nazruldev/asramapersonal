import { createPortal } from 'react-dom';

const APP_ICON_URL = `${import.meta.env.BASE_URL}apple-touch-icon.png`;
/** typeof aman jika Vite belum inject define (server belum restart). */
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

type Props = {
  message?: string;
  /** full screen overlay */
  fullscreen?: boolean;
  /** Overlay gelap semi-transparan (untuk aksi singkat seperti ganti asrama). */
  dim?: boolean;
};

export function AppLoadingIndicator({
  message = 'Memuat data…',
  fullscreen = false,
  dim = false,
}: Props) {
  const ring = (size: 'sm' | 'lg' = 'sm') => {
    const box = size === 'lg' ? 'w-32 h-32' : 'w-20 h-20';
    const logo =
      size === 'lg'
        ? 'relative w-20 h-20 rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 dark:ring-white/10'
        : 'relative w-10 h-10 rounded-lg overflow-hidden shadow-md ring-1 ring-black/5 dark:ring-white/10';
    const stroke = size === 'lg' ? 3.5 : 3;

    return (
      <div className={`relative flex items-center justify-center ${box}`}>
        {/* Track + arc mengisi lingkaran */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90 animate-spin"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-slate-200 dark:text-slate-700"
          />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray="90 200"
            className="text-emerald-600 dark:text-emerald-500"
          />
        </svg>
        <div className={logo}>
          <img
            src={APP_ICON_URL}
            alt=""
            className="w-full h-full object-cover"
            decoding="async"
          />
        </div>
      </div>
    );
  };

  if (fullscreen && dim) {
    // Portal ke body agar menutup tab bawah (footer z-50) & header.
    return createPortal(
      <div
        className="fixed inset-0 z-[400] flex flex-col items-center justify-center gap-4 bg-black/55 backdrop-blur-[2px] px-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="rounded-2xl bg-white/95 dark:bg-slate-900/95 p-5 shadow-lg ring-1 ring-black/10 dark:ring-white/10">
          {ring('lg')}
        </div>
        <p className="text-sm text-white font-medium text-center drop-shadow-sm">{message}</p>
      </div>,
      document.body
    );
  }

  if (fullscreen) {
    return createPortal(
      <div
        className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 gap-5 px-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {ring('lg')}
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium text-center">{message}</p>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 px-6 pb-8 [padding-bottom:calc(2rem+env(safe-area-inset-bottom))]">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Aplikasi dibuat oleh Nasrullah
          </p>
          <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 text-center">
            Versi {APP_VERSION}
          </p>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10 px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {ring()}
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center">{message}</p>
    </div>
  );
}
