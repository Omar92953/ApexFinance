import { useEffect, useState } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import type { Business, ShippingZone } from '@/services/db';
import { shippingApi } from '@/services/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatCurrency } from '@/lib/utils';

export default function ShippingZonesCard({ business, onChanged }: { business: Business; onChanged: () => void }) {
  const cur = business.currency ?? 'USD';
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');

  const load = async () => setZones(await shippingApi.listZones(business.id));
  useEffect(() => { load(); }, [business.id]);

  const add = async () => {
    if (!name.trim()) return;
    await shippingApi.createZone({
      business_id: business.id, name: name.trim(), flat_rate: parseFloat(rate) || 0,
      is_default: zones.length === 0, sort_order: zones.length,
    });
    setName(''); setRate('');
    await load(); onChanged();
  };

  const setDefault = async (z: ShippingZone) => {
    await Promise.all(zones.map((x) => shippingApi.updateZone(x.id, { is_default: x.id === z.id })));
    await load(); onChanged();
  };
  const del = async (id: string) => { await shippingApi.removeZone(id); await load(); onChanged(); };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Shipping zones</h3>
      <p className="text-xs text-muted-foreground mb-3">Flat shipping cost per destination. The default zone's rate × orders is applied to profit.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Zone (e.g. Cairo)" className="flex-1 min-w-[160px]" />
        <Input type="number" step="any" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Flat rate" className="w-32" />
        <Button onClick={add} disabled={!name.trim()}><Plus className="h-4 w-4 mr-1.5" /> Add zone</Button>
      </div>

      {zones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No zones yet.</p>
      ) : (
        <div className="space-y-2">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <button onClick={() => setDefault(z)} title="Set as default" className={cn(z.is_default ? 'text-warning' : 'text-muted-foreground hover:text-foreground')}>
                  <Star className={cn('h-4 w-4', z.is_default && 'fill-current')} />
                </button>
                <span>{z.name}{z.is_default && <span className="ml-2 text-[10px] text-muted-foreground">default</span>}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular-nums font-medium">{formatCurrency(Number(z.flat_rate) || 0, cur, true)}</span>
                <button onClick={() => del(z.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
