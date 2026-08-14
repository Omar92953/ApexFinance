import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { asset } from '@/lib/asset';
import { useUiStore } from '@/stores/uiStore';
import SidebarNav from './SidebarNav';

// A left slide-over for mobile — the shared ui/dialog.tsx is a centered
// modal, not reusable for this, so this builds directly on the same Radix
// primitive with its own positioning.
export default function MobileSidebarDrawer() {
  const open = useUiStore((s) => s.mobileDrawerOpen);
  const setOpen = useUiStore((s) => s.setMobileDrawerOpen);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card border-r border-border md:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <div className="flex items-center justify-between gap-2.5 px-4 h-14 border-b border-border">
            <div className="flex items-center gap-2.5">
              <img src={asset('icon.png')} alt="Apex Business Manager" className="h-7 w-7 object-contain" />
              <div className="leading-tight">
                <div className="text-sm font-bold tracking-tight">Apex Business</div>
                <div className="text-[10px] text-muted-foreground">Manager</div>
              </div>
            </div>
            <DialogPrimitive.Close className="rounded p-1.5 hover:bg-muted" aria-label="Close menu">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <SidebarNav onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
