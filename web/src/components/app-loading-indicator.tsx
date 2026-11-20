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
  const ring = (
    <div className="relative flex items-center justify-center w-20 h-20">
      <div
        className="absolute inset-0 rounded-full border-2 border-slate-200/70 dark:border-slate-700/80 border-t-emerald-600 dark:border-t-emerald-500 animate-spin"
        aria-hidden
      />
      <div className="relative w-10 h-10 rounded-lg overflow-hidden shadow-md ring-1 ring-black/5 dark:ring-white/10">
        <img
          src={APP_ICON_URL}
          alt=""
          width={40}
          height={40}
          className="w-full h-full object-cover"
          decoding="async"
        />
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950 gap-4 px-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {ring}
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center">{message}</p>
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
      {ring}
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center">{message}</p>
    </div>
  );
}
