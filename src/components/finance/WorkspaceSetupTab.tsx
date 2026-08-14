import { useState } from 'react';
import type { Business } from '@/services/db';
import { useBusinessStore } from '@/stores/businessStore';
import { BUSINESS_TYPES, CAPABILITY_LABELS, defaultCapabilities, resolveCapabilities, type BusinessType, type Capabilities } from '@/config/businessTypes';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Lets a business deviate from its type preset — plenty of real businesses
// straddle categories (a shop that also runs ads, an agency that resells
// hardware), so the preset is a starting point rather than a cage.
export default function WorkspaceSetupTab({ business }: { business: Business }) {
  const { update } = useBusinessStore();
  const [type, setType] = useState<BusinessType>((business.business_type as BusinessType) ?? 'ecommerce');
  const [caps, setCaps] = useState<Capabilities>(() =>
    resolveCapabilities(business.business_type, business.capabilities as Partial<Capabilities> | null));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const preset = defaultCapabilities(type);
  const overridden = (Object.keys(preset) as Array<keyof Capabilities>).filter((k) => caps[k] !== preset[k]);

  const pickType = (t: BusinessType) => {
    setType(t);
    setCaps(defaultCapabilities(t));   // switching type resets to that preset
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      // Store only genuine deviations, so future preset changes still flow through.
      const overrides: Partial<Capabilities> = {};
      for (const k of overridden) overrides[k] = caps[k];
      await update(business.id, {
        business_type: type,
        capabilities: Object.keys(overrides).length ? (overrides as Record<string, boolean>) : null,
      });
      setMsg('Saved. Reload or switch business to see the sections update.');
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : e}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">Business type</h3>
        <p className="text-xs text-muted-foreground mb-3">Sets which sections, metrics and alerts this workspace shows.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {BUSINESS_TYPES.map((t) => (
            <button key={t.key} type="button" onClick={() => pickType(t.key)}
              className={cn('rounded-lg border p-3 text-left transition-colors', type === t.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}>
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-[11px] text-muted-foreground leading-snug">{t.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold mb-1">What this business does</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Fine-tune the preset. Anything you change here sticks even if the type's defaults change later.
        </p>
        <div className="space-y-1">
          {(Object.keys(preset) as Array<keyof Capabilities>).map((key) => (
            <div key={key} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <div className="text-sm">{CAPABILITY_LABELS[key]}</div>
                {caps[key] !== preset[key] && (
                  <div className="text-[11px] text-warning">Overridden — preset is {preset[key] ? 'on' : 'off'}</div>
                )}
              </div>
              <Switch checked={caps[key]} onCheckedChange={(v) => setCaps({ ...caps, [key]: v })} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save workspace setup'}</Button>
        {overridden.length > 0 && (
          <Button variant="outline" onClick={() => setCaps(defaultCapabilities(type))}>Reset to preset</Button>
        )}
        {msg && <span className={cn('text-xs', msg.startsWith('Error') ? 'text-destructive' : 'text-success')}>{msg}</span>}
      </div>
    </div>
  );
}
