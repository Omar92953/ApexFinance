import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, Settings, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { asset } from '@/lib/asset';
import { useAuthStore } from '@/stores/authStore';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/businesses', label: 'Businesses', icon: Building2, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();

  return (
    <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
        <img src={asset('icon.png')} alt="Apex Business Manager" className="h-7 w-7 object-contain" />
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight">Apex Business</div>
          <div className="text-[10px] text-muted-foreground">Manager</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                isActive ? 'sidebar-nav-active' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="px-3 pb-2 text-[11px] text-muted-foreground truncate">{user?.email}</div>
        <button
          onClick={async () => { await signOut(); navigate('/'); }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
