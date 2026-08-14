import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useBusinessStore } from '@/stores/businessStore';

// Landing logic for "/": send the user straight into whichever business
// they were last looking at (or the first one, or the manage-businesses
// page if there are none yet) instead of a separate cross-business
// dashboard — the switcher + sidebar are now always "inside" a business.
export default function RootRedirect() {
  const { businesses, loaded, lastActiveId, fetch } = useBusinessStore();

  useEffect(() => { if (!loaded) fetch(); }, [loaded, fetch]);

  if (!loaded) return <p className="text-muted-foreground">Loading…</p>;
  if (businesses.length === 0) return <Navigate to="/businesses" replace />;

  const target = businesses.find((b) => b.id === lastActiveId) ?? businesses[0];
  return <Navigate to={`/businesses/${target.id}/overview`} replace />;
}
