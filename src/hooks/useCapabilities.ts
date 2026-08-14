import { useMemo } from 'react';
import type { Business } from '@/services/db';
import { resolveCapabilities, type Capabilities } from '@/config/businessTypes';

// Resolves a business's effective capabilities (type preset + overrides).
// Accepts null so layout-level chrome can call it before a business loads.
export function useCapabilities(business: Business | null | undefined): Capabilities {
  return useMemo(
    () => resolveCapabilities(business?.business_type, business?.capabilities as Partial<Capabilities> | null),
    [business?.business_type, business?.capabilities],
  );
}
