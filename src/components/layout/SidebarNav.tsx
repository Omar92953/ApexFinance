import { useEffect, useState } from 'react';
import { NavLink, useMatch, useNavigate } from 'react-router-dom';
import { ChevronRight, Settings, LogOut } from 'lucide-react';
import { SECTIONS, SUB_TABS, DEFAULT_SUB_TAB, type SectionKey } from '@/config/businessSections';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessStore } from '@/stores/businessStore';
import { cn } from '@/lib/utils';

// The nav body shared by the desktop Sidebar (fixed aside) and the mobile
// slide-over drawer — same markup, different chrome around it.
export default function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();
  const { businesses, lastActiveId } = useBusinessStore();
  const matchWithSub = useMatch('/businesses/:id/:section/:subTab');
  const matchNoSub = useMatch('/businesses/:id/:section');
  const params = matchWithSub?.params ?? matchNoSub?.params;
  const routeId = params?.id;
  // On pages outside a business workspace (Settings, Manage businesses) the
  // route has no :id — fall back to the last-used business so the section
  // links stay live and you're never stranded with a dead menu.
  const currentId = routeId ?? (businesses.some((b) => b.id === lastActiveId) ? lastActiveId : businesses[0]?.id) ?? undefined;
  const currentSection = routeId ? (params?.section as SectionKey | undefined) : undefined;
  const currentSubTab = routeId ? matchWithSub?.params.subTab : undefined;

  const [expanded, setExpanded] = useState<SectionKey | null>(currentSection ?? null);
  useEffect(() => { if (currentSection) setExpanded(currentSection); }, [currentSection]);

  const goSection = (key: SectionKey) => {
    if (!currentId) return;
    if (key === currentSection) {
      setExpanded((e) => (e === key ? null : key));
      return;
    }
    setExpanded(key);
    navigate(key === 'overview' ? `/businesses/${currentId}/overview` : `/businesses/${currentId}/${key}/${DEFAULT_SUB_TAB[key]}`);
    onNavigate?.();
  };

  const goSubTab = (key: SectionKey, subKey: string) => {
    if (!currentId) return;
    navigate(`/businesses/${currentId}/${key}/${subKey}`);
    onNavigate?.();
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <nav className={cn('space-y-0.5 p-3', !currentId && 'pointer-events-none opacity-40')}>
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <div key={key}>
            <button
              onClick={() => goSection(key)}
              className={cn(
                'sidebar-nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                key === currentSection ? 'sidebar-nav-active' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {key !== 'overview' && (
                <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', expanded === key && 'rotate-90')} />
              )}
            </button>
            {key !== 'overview' && expanded === key && (
              <div className="ml-[27px] mt-0.5 space-y-0.5 border-l border-border pl-3">
                {SUB_TABS[key].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => goSubTab(key, t.key)}
                    className={cn(
                      'block w-full rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                      key === currentSection && t.key === currentSubTab
                        ? 'text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-border p-3">
        <NavLink
          to="/settings"
          onClick={() => onNavigate?.()}
          className={({ isActive }) =>
            cn(
              'sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              isActive ? 'sidebar-nav-active' : 'text-muted-foreground hover:text-foreground',
            )
          }
        >
          <Settings className="h-[18px] w-[18px]" />
          Settings
        </NavLink>
      </div>

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
    </div>
  );
}
