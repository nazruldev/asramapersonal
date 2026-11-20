import { useAppStore } from '@/store/app-store';
import {
  DEFAULT_INDONESIA_TIMEZONE,
  normalizeIndonesiaTimezone,
  type IndonesiaTimezoneId,
} from '@/lib/indonesia-timezone';

export function useAppZonaWaktu(): IndonesiaTimezoneId {
  const zona = useAppStore((s) => s.settings?.zonaWaktu);
  return normalizeIndonesiaTimezone(zona ?? DEFAULT_INDONESIA_TIMEZONE);
}
