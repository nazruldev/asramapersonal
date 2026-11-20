import { useCallback, useState } from 'react';

export type ConfirmRequest = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = useCallback((req: ConfirmRequest) => setRequest(req), []);
  const close = useCallback(() => {
    if (!loading) setRequest(null);
  }, [loading]);

  const confirm = useCallback(async () => {
    if (!request) return;
    setLoading(true);
    try {
      await request.onConfirm();
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [request]);

  return {
    request,
    loading,
    ask,
    close,
    confirm,
    open: !!request,
  };
}
