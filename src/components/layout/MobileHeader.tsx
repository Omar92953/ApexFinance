import { asset } from '@/lib/asset';

// Top brand bar — phones only. Clears the iPhone notch / status bar.
export default function MobileHeader() {
  return (
    <div
      className="md:hidden sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-card/90 backdrop-blur-xl px-4 py-3"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
    >
      <img src={asset('icon.png')} alt="Apex Finance" className="h-6 w-6 object-contain" />
      <span className="text-sm font-bold tracking-tight">Apex Finance</span>
    </div>
  );
}
