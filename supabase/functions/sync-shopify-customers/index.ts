// Edge Function: sync-shopify-customers
// Imports Shopify customers into the CRM `contacts` table (name, email, phone,
// city/country, tags, total spent, orders count, marketing consent).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { business_id } = await req.json().catch(() => ({}));
    if (!business_id) return json({ error: 'business_id required' }, 400);

    const { data: userData } = await svc.auth.getUser(token);
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { data: cred } = await svc.from('api_credentials')
      .select('credentials').eq('business_id', business_id).eq('platform', 'shopify').eq('user_id', user.id).maybeSingle();
    if (!cred) return json({ error: 'Shopify not connected for this business' }, 404);

    const creds = cred.credentials as ShopifyCreds;
    const customers = await fetchAllCustomers(creds.shopUrl, creds.accessToken);

    const rows = customers.map((c: any) => {
      const consent = c.email_marketing_consent?.state === 'subscribed' || c.accepts_marketing === true;
      const addr = c.default_address || {};
      return {
        user_id: user.id,
        business_id,
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
    }).filter((r) => r.email); // upsert dedupes on (business_id, email)

    let imported = 0;
    if (rows.length) {
      const { error } = await svc.from('contacts').upsert(rows, { onConflict: 'business_id,email' });
      if (error) throw error;
      imported = rows.length;
    }
    return json({ success: true, imported, fetched: customers.length });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
