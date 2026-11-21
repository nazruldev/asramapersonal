import { avatarInitials } from '@/lib/app-avatar';
import { cn } from '@/lib/utils';

type SantriAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<SantriAvatarSize, string> = {
  xs: 'w-6 h-6 text-[9px]',
  sm: 'w-9 h-9 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-16 h-16 text-lg',
};

type SantriAvatarProps = {
  nama: string;
  foto?: string | null;
  size?: SantriAvatarSize;
  className?: string;
  alt?: string;
};

/** Avatar santri — sama gaya daftar Santri (foto atau inisial emerald). */
export function SantriAvatar({
  nama,
  foto,
  size = 'sm',
  className,
  alt,
}: SantriAvatarProps) {
  const box = SIZE_CLASS[size];
  if (foto) {
    return (
      <img
        src={foto}
        alt={alt ?? nama}
        className={cn(box, 'rounded-sm object-cover shrink-0', className)}
      />
    );
  }
  return (
    <div
      className={cn(
        box,
        'rounded-sm bg-emerald-700 text-white font-bold flex items-center justify-center shrink-0',
        className
      )}
      aria-hidden={!alt}
      aria-label={alt}
    >
      {avatarInitials(nama || 'S')}
    </div>
  );
}
