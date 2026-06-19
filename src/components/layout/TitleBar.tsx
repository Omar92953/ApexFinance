import { Minus, Square, X } from 'lucide-react';
import { asset } from '@/lib/asset';

// Native window controls only render inside the Electron desktop build.
// On the web (no window.electronAPI) the title bar is hidden entirely.
export default function TitleBar() {
  const electron = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!electron?.window) return null;

  return (
    <div className="titlebar-drag flex h-9 items-center justify-between border-b border-border bg-card px-3 select-none">
      <div className="flex items-center gap-2">
        <img src={asset('icon.png')} alt="Apex Finance" className="h-4 w-4 object-contain" />
        <span className="text-[12px] font-semibold text-foreground tracking-wide">Apex Finance</span>
      </div>
      <div className="titlebar-no-drag flex items-center gap-1">
        <button onClick={() => electron.window?.minimize()} className="rounded p-1.5 hover:bg-muted" aria-label="Minimize">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => electron.window?.maximize()} className="rounded p-1.5 hover:bg-muted" aria-label="Maximize">
          <Square className="h-3 w-3" />
        </button>
        <button onClick={() => electron.window?.close()} className="rounded p-1.5 hover:bg-destructive hover:text-destructive-foreground" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
