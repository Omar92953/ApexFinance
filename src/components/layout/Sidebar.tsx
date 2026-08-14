import { asset } from '@/lib/asset';
import SidebarNav from './SidebarNav';

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
        <img src={asset('icon.png')} alt="Apex Business Manager" className="h-7 w-7 object-contain" />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">Apex Business</div>
          <div className="text-[10px] text-muted-foreground">Manager</div>
        </div>
      </div>

      <SidebarNav />
    </aside>
  );
}
