import { Minus, Square, X, Menu } from 'lucide-react';
import { asset } from '@/lib/asset';
import { useUiStore } from '@/stores/uiStore';
import BusinessSwitcher from '@/components/business/BusinessSwitcher';

// Always renders now — on the web build this is the app's only persistent
// top bar; inside Electron it doubles as the draggable title bar with
// native window controls. Native window controls only render inside the
// Electron desktop build (no window.electronAPI on web).
export default function TitleBar() {
  const electron = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const toggleMobileDrawer = useUiStore((s) => s.toggleMobileDrawer);
  const isElectron = !!electron?.window;

  return (
    <div className="titlebar-drag flex h-11 items-center justify-between border-b border-border bg-card px-2 sm:px-3 select-none">
      <div className="titlebar-no-drag flex items-center gap-2">
        <button
          onClick={toggleMobileDrawer}
          className="md:hidden rounded p-1.5 hover:bg-muted"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="hidden md:flex items-center gap-2">
          <img src={asset('icon.png')} alt="Apex Business Manager" className="h-4 w-4 object-contain" />
          <span className="text-[12px] font-semibold text-foreground tracking-wide">Apex Business Manager</span>
        </div>
      </div>

      <div className="titlebar-no-drag flex items-center gap-1">
        <BusinessSwitcher />
        {isElectron && (
          <div className="flex items-center gap-1 ml-1">
            <button onClick={() => electron!.window?.minimize()} className="rounded p-1.5 hover:bg-muted" aria-label="Minimize">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => electron!.window?.maximize()} className="rounded p-1.5 hover:bg-muted" aria-label="Maximize">
              <Square className="h-3 w-3" />
            </button>
            <button onClick={() => electron!.window?.close()} className="rounded p-1.5 hover:bg-destructive hover:text-destructive-foreground" aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
