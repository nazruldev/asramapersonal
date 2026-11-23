import { useEffect, useState } from 'react';
import { avatarInitials } from '@/lib/app-avatar';
import { maybeCompressImageDataUrl } from '@/lib/image-compress';
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

function Initials({
  nama,
  size,
  className,
  alt,
}: {
  nama: string;
  size: SantriAvatarSize;
  className?: string;
  alt?: string;
}) {
  return (
    <div
      className={cn(
        SIZE_CLASS[size],
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

/** Avatar santri — foto dikompres bila terlalu besar; gagal load → inisial. */
export function SantriAvatar({
  nama,
  foto,
  size = 'sm',
  className,
  alt,
}: SantriAvatarProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBroken(false);
    const raw = foto?.trim() || '';
    if (!raw) {
      setSrc(null);
      return;
    }
    setSrc(raw);
    void maybeCompressImageDataUrl(raw).then((next) => {
      if (!cancelled) setSrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [foto]);

  if (!src || broken) {
    return <Initials nama={nama} size={size} className={className} alt={alt} />;
  }

  return (
    <img
      src={src}
      alt={alt ?? nama}
      className={cn(SIZE_CLASS[size], 'rounded-sm object-cover shrink-0', className)}
      onError={() => setBroken(true)}
    />
  );
}
