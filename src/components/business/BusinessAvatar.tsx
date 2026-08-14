import type { Business } from '@/services/db';
import { cn } from '@/lib/utils';

const SIZE_CLASSES = {
  sm: 'h-8 w-8 rounded-lg text-sm',
  md: 'h-10 w-10 rounded-lg text-base',
  lg: 'h-11 w-11 rounded-xl text-lg',
} as const;

export default function BusinessAvatar({ business, size = 'md', className }: {
  business: Pick<Business, 'name' | 'logo'>;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  if (business.logo) {
    return (
      <img
        src={business.logo}
        alt={business.name}
        className={cn(SIZE_CLASSES[size], 'object-cover shrink-0', className)}
      />
    );
  }
  return (
    <div className={cn(SIZE_CLASSES[size], 'flex items-center justify-center bg-primary/10 text-primary font-bold shrink-0', className)}>
      {business.name.charAt(0).toUpperCase()}
    </div>
  );
}
