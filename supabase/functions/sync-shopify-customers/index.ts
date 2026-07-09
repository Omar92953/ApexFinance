// Edge Function: sync-shopify-customers
// Imports Shopify customers into the CRM `contacts` table (name, email, phone,
// city/country, tags, total spent, orders count, marketing consent).
//
// Two modes (same as sync-shopify): user-triggered (JWT + business_id) or
// cron-triggered (service-role key, syncs every Shopify connection).
//
// Security: the Shopify token lives only in api_credentials, read with the
// service-role key. Caller must be authenticated and own the business.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SHOPIFY_API_VERSION = '2024-01';
interface ShopifyCreds { shopUrl: string; accessToken: string }

async function fetchAllCustomers(shopUrl: string, token: string) {
  const clean = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let url = `https://${clean}/admin/api/${SHOPIFY_API_VERSION}/customers.json?limit=250`;
  const customers: any[] = [];
  for (let page = 0; page < 40 && url; page++) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    const body = await res.json();
    customers.push(...(body.customers || []));
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((p) => p.includes('rel="next"'));
    url = next ? (next.match(/<([^>]+)>/)?.[1] ?? '') : '';
  }
  return customers;
}

async function syncBusiness(svc: any, userId: string, businessId: string, creds: ShopifyCreds) {
  const customers = await fetchAllCustomers(creds.shopUrl, creds.accessToken);

  const rows = customers.map((c: any) => {
    const consent = c.email_marketing_consent?.state === 'subscribed' || c.accepts_marketing === true;
    const addr = c.default_address || {};
    return {
      user_id: userId,
      business_id: businessId,
      shopify_customer_id: String(c.id),
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      email: c.email || null,
      phone: c.phone || addr.phone || null,
      city: addr.city || null,
      country: addr.country || null,
      status: (Number(c.orders_count) || 0) > 1 ? 'vip' : (Number(c.orders_count) || 0) === 1 ? 'customer' : 'lead',
      source: 'shopify',
      tags: c.tags ? String(c.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      total_spent: parseFloat(c.total_spent || '0'),
      orders_count: Number(c.orders_count) || 0,
      accepts_marketing: consent,
      last_order_date: c.last_order_id && c.updated_at ? String(c.updated_at).slice(0, 10) : null,
      updated_at: new Date().toISOString(),
    };
  }).filter((r: any) => r.email); // upsert dedupes on (business_id, email)

  let imported = 0;
  if (rows.length) {
    const { error } = await svc.from('contacts').upsert(rows, { onConflict: 'business_id,email' });
    if (error) throw error;
    imported = rows.length;
  }

  await svc.from('api_credentials').update({ is_valid: true, last_verified: new Date().toISOString() })
    .eq('business_id', businessId).eq('platform', 'shopify').eq('user_id', userId);

  return { business_id: businessId, imported, fetched: customers.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const body = await req.json().catch(() => ({}));

    if (token && token === serviceKey && !body.business_id) {
      const { data: creds } = await svc.from('api_credentials').select('business_id, user_id, credentials').eq('platform', 'shopify');
      const results = [];
      for (const c of creds || []) {
        try { results.push(await syncBusiness(svc, c.user_id, c.business_id, c.credentials)); }
        catch (e) { results.push({ business_id: c.business_id, error: String(e instanceof Error ? e.message : e) }); }
      }
      return json({ success: true, mode: 'cron', synced: results.length, results });
    }

    // User mode: the app runs with login disabled (no real Supabase Auth session),
    // so identify the caller by the business's own stored credential row instead
    // of a JWT-bound user — consistent with the app's no-login/open_access model.
    if (!body.business_id) return json({ error: 'business_id required' }, 400);

    const { data: cred } = await svc.from('api_credentials')
      .select('user_id, credentials').eq('business_id', body.business_id).eq('platform', 'shopify').maybeSingle();
    if (!cred) return json({ error: 'Shopify not connected for this business' }, 404);

    const result = await syncBusiness(svc, cred.user_id, body.business_id, cred.credentials);
    return json({ success: true, ...result });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
