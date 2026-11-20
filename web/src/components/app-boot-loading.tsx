import { AppLoadingIndicator } from '@/components/app-loading-indicator';

type Props = {
  message?: string;
};

export function AppBootLoading({ message = 'Memuat data…' }: Props) {
  return <AppLoadingIndicator message={message} fullscreen />;
}
