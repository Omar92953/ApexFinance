import { useEffect, useState } from 'react';
import { useBusinessStore } from '@/stores/businessStore';
import type { Business } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BUSINESS_TYPES, type BusinessType } from '@/config/businessTypes';
import { cn } from '@/lib/utils';

// Every business is EGP-only and keeps 100% of its own net profit — no
// per-business currency or profit-split configuration to manage.
const EMPTY: Partial<Business> = {
  name: '',
  business_type: 'ecommerce',
  profit_model: 'owner',
  percentage_value: 0,
  fixed_amount: 0,
  is_owner: true,
  currency: 'EGP',
};

export default function BusinessFormDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: Business | null;
  onSaved?: (b: Business) => void;
}) {
  const { create, update } = useBusinessStore();
  const [form, setForm] = useState<Partial<Business>>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(editing ?? EMPTY); }, [editing, open]);

  const save = async () => {
    if (!form.name?.trim()) return;
    setSaving(true);
    try {
      const payload: Partial<Business> = {
        ...form,
        name: form.name.trim(),
        business_type: form.business_type ?? 'ecommerce',
        currency: 'EGP',
        profit_model: 'owner',
        is_owner: true,
      };
      const saved = editing ? await (async () => { await update(editing.id, payload); return { ...editing, ...payload } as Business; })() : await create(payload);
      onOpenChange(false);
      onSaved?.(saved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit business' : 'New business'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Business name</Label>
            <Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Store" />
          </div>

          <div className="space-y-1.5">
            <Label>What kind of business is this?</Label>
            <p className="text-xs text-muted-foreground">
              Decides which sections and metrics this workspace shows. You can fine-tune it later in Setup.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 pt-1">
              {BUSINESS_TYPES.map((t) => {
                const selected = (form.business_type ?? 'ecommerce') === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setForm({ ...form, business_type: t.key as BusinessType })}
                    className={cn(
                      'rounded-lg border p-2.5 text-left transition-colors',
                      selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-snug">{t.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.name?.trim()}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
