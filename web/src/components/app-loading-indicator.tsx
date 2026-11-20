const APP_ICON_URL = `${import.meta.env.BASE_URL}apple-touch-icon.png`;

type Props = {
  message?: string;
  /** full screen overlay */
  fullscreen?: boolean;
};

export function AppLoadingIndicator({
  message = 'Memuat data…',
  fullscreen = false,
}: Props) {
  const ring = (size: 'sm' | 'lg' = 'sm') => (
    <div
      className={
        size === 'lg'
          ? 'relative flex items-center justify-center w-32 h-32'
          : 'relative flex items-center justify-center w-20 h-20'
      }
    >
      <div
        className="absolute inset-0 rounded-full border-2 border-slate-200/70 dark:border-slate-700/80 border-t-emerald-600 dark:border-t-emerald-500 animate-spin"
        aria-hidden
      />
      <div
        className={
          size === 'lg'
            ? 'relative w-20 h-20 rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 dark:ring-white/10'
            : 'relative w-10 h-10 rounded-lg overflow-hidden shadow-md ring-1 ring-black/5 dark:ring-white/10'
        }
      >
        <img
          src={APP_ICON_URL}
          alt=""
          className="w-full h-full object-cover"
          decoding="async"
        />
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 gap-5 px-6"
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
            Versi {__APP_VERSION__}
          </p>
        </div>
      </div>
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
