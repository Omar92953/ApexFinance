import { create } from 'zustand';

// Tiny UI-only store for cross-component toggles that don't belong in any
// data store — currently just the mobile sidebar drawer, which is opened
// from TitleBar's hamburger button and rendered from MainLayout (siblings,
// not parent/child, so a store is simpler than prop-drilling through both).
interface UiState {
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (v: boolean) => void;
  toggleMobileDrawer: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  mobileDrawerOpen: false,
  setMobileDrawerOpen: (v) => set({ mobileDrawerOpen: v }),
  toggleMobileDrawer: () => set((s) => ({ mobileDrawerOpen: !s.mobileDrawerOpen })),
}));
