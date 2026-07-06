// Edge Function: sync-shopify
// Pulls Shopify orders for a business and writes daily gross/net sales, order
// count, and units sold into metrics_cache. Ported from electron/services/shopify.ts.
//
// Two modes:
//  - User mode: called from the app with a user JWT + { business_id }. Verifies the
//    caller owns the business, syncs that one.
//  - Cron mode: called with the service-role key (from pg_cron/pg_net), no business_id.
//    Iterates every Shopify connection and syncs each under its own user_id.
//
// Security: Shopify tokens live only in api_credentials, read with the service-role
// key. They are never returned to the client.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SHOPIFY_API_VERSION = '2024-01';
interface ShopifyCreds { shopUrl: string; accessToken: string }

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function fetchAllOrders(shopUrl: string, token: string, start: string, end: string) {
  const clean = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let url =
    `https://${clean}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
    `?status=any&limit=250&created_at_min=${start}T00:00:00Z&created_at_max=${end}T23:59:59Z`;
  const orders: any[] = [];
  for (let page = 0; page < 20 && url; page++) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    const body = await res.json();
    orders.push(...(body.orders || []));
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((p) => p.includes('rel="next"'));
    url = next ? (next.match(/<([^>]+)>/)?.[1] ?? '') : '';
  }
  return orders;
}

async function syncBusiness(svc: any, userId: string, businessId: string, creds: ShopifyCreds, days: number) {
  const { start, end } = dateRange(days);
  const orders = await fetchAllOrders(creds.shopUrl, creds.accessToken, start, end);

  type Day = { gross: number; net: number; orders: number; units: number };
  const daily = new Map<string, Day>();
  for (const o of orders) {
    const date = String(o.created_at).split('T')[0];
    const d = daily.get(date) ?? { gross: 0, net: 0, orders: 0, units: 0 };
    const total = parseFloat(o.total_price || '0');
    const refunded = o.financial_status === 'refunded';
    const cancelled = o.cancelled_at !== null && o.cancelled_at !== undefined;
    d.gross += total;
    d.net += refunded ? 0 : total;
    if (!refunded && !cancelled) {
      d.orders += 1;
      d.units += (o.line_items || []).reduce((s: number, li: any) => s + (li.quantity || 0), 0);
    }
    daily.set(date, d);
  }

  const rows: any[] = [];
  for (const [date, d] of daily) {
    rows.push(
      { user_id: userId, business_id: businessId, platform: 'shopify', metric_date: date, metric_type: 'gross_sales', metric_value: d.gross },
      { user_id: userId, business_id: businessId, platform: 'shopify', metric_date: date, metric_type: 'net_sales', metric_value: d.net },
      { user_id: userId, business_id: businessId, platform: 'shopify', metric_date: date, metric_type: 'orders', metric_value: d.orders },
      { user_id: userId, business_id: businessId, platform: 'shopify', metric_date: date, metric_type: 'units_sold', metric_value: d.units },
    );
  }
  if (rows.length) {
    const { error } = await svc.from('metrics_cache').upsert(rows, { onConflict: 'business_id,platform,metric_date,metric_type' });
    if (error) throw error;
  }
  await svc.from('api_credentials').update({ is_valid: true, last_verified: new Date().toISOString() })
    .eq('business_id', businessId).eq('platform', 'shopify').eq('user_id', userId);

  return { business_id: businessId, orders: orders.length, days_written: daily.size, range: { start, end } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const body = await req.json().catch(() => ({}));
    const days = body.days ?? 30;

    // Cron mode: service-role key, sync every Shopify connection.
    if (token && token === serviceKey && !body.business_id) {
      const { data: creds } = await svc.from('api_credentials').select('business_id, user_id, credentials').eq('platform', 'shopify');
      const results = [];
      for (const c of creds || []) {
        try { results.push(await syncBusiness(svc, c.user_id, c.business_id, c.credentials, days)); }
        catch (e) { results.push({ business_id: c.business_id, error: String(e instanceof Error ? e.message : e) }); }
      }
      return json({ success: true, mode: 'cron', synced: results.length, results });
    }

    // User mode: verify caller owns the business.
    const { data: userData } = await svc.auth.getUser(token);
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (!body.business_id) return json({ error: 'business_id required' }, 400);

    const { data: cred } = await svc.from('api_credentials')
      .select('credentials').eq('business_id', body.business_id).eq('platform', 'shopify').eq('user_id', user.id).maybeSingle();
    if (!cred) return json({ error: 'Shopify not connected for this business' }, 404);

    const result = await syncBusiness(svc, user.id, body.business_id, cred.credentials, days);
    return json({ success: true, ...result });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
