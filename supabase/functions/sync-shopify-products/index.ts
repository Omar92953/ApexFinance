// Edge Function: sync-shopify-products
// Pulls the full Shopify product catalog (paginated) plus each variant's true
// cost (from Shopify's inventory items — cost isn't on the variant payload
// itself), and upserts into products/product_variants: price, cost per item,
// image, and current stock quantity.
//
// Two modes (same as sync-shopify): user-triggered (JWT + business_id) or
// cron-triggered (service-role key, syncs every Shopify connection).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SHOPIFY_API_VERSION = '2024-01';
interface ShopifyCreds { shopUrl: string; accessToken: string }

async function fetchAllProducts(shopUrl: string, token: string) {
  const clean = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let url = `https://${clean}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;
  const products: any[] = [];
  for (let page = 0; page < 40 && url; page++) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
    const body = await res.json();
    products.push(...(body.products || []));
    const link = res.headers.get('link') || '';
    const next = link.split(',').find((p) => p.includes('rel="next"'));
    url = next ? (next.match(/<([^>]+)>/)?.[1] ?? '') : '';
  }
  return products;
}

// Variant cost lives on the InventoryItem, not the variant itself — batch-fetch
// in chunks of 100 ids (Shopify's practical limit for this endpoint).
async function fetchInventoryItemCosts(shopUrl: string, token: string, inventoryItemIds: string[]): Promise<Map<string, number>> {
  const clean = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const costByItemId = new Map<string, number>();
  const unique = Array.from(new Set(inventoryItemIds.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const url = `https://${clean}/admin/api/${SHOPIFY_API_VERSION}/inventory_items.json?ids=${chunk.join(',')}`;
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) continue; // don't fail the whole sync if cost lookup has an issue
    const body = await res.json();
    for (const item of body.inventory_items || []) {
      if (item.cost != null) costByItemId.set(String(item.id), parseFloat(item.cost));
    }
  }
  return costByItemId;
}

async function syncBusiness(svc: any, userId: string, businessId: string, creds: ShopifyCreds) {
  const shopifyProducts = await fetchAllProducts(creds.shopUrl, creds.accessToken);
  const allInventoryItemIds = shopifyProducts.flatMap((p) => (p.variants || []).map((v: any) => String(v.inventory_item_id || '')));
  const costByItemId = await fetchInventoryItemCosts(creds.shopUrl, creds.accessToken, allInventoryItemIds);

  const productRows = shopifyProducts.map((p) => ({
    user_id: userId, business_id: businessId,
    shopify_product_id: String(p.id),
    handle: p.handle,
    title: p.title,
    vendor: p.vendor || null,
    product_type: p.product_type || null,
    tags: p.tags ? String(p.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    status: (p.status || 'active').toLowerCase(),
    image_url: p.image?.src || null,
    updated_at: new Date().toISOString(),
  }));

  let savedProducts: any[] = [];
  if (productRows.length) {
    const { data, error } = await svc.from('products').upsert(productRows, { onConflict: 'business_id,handle' }).select('id, handle');
    if (error) throw error;
    savedProducts = data || [];
  }
  const productIdByHandle = new Map(savedProducts.map((p: any) => [p.handle, p.id]));

  const variantRows: any[] = [];
  for (const p of shopifyProducts) {
    const productId = productIdByHandle.get(p.handle);
    if (!productId) continue;
    for (const v of (p.variants || [])) {
      const cost = costByItemId.get(String(v.inventory_item_id || ''));
      variantRows.push({
        user_id: userId, business_id: businessId, product_id: productId,
        shopify_variant_id: String(v.id),
        title: v.title || 'Default',
        sku: v.sku || `${p.handle}-${v.id}`,
        price: parseFloat(v.price || '0'),
        compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
        cost_per_item: cost ?? 0,
        weight: v.weight ?? null,
        weight_unit: v.weight_unit || 'kg',
        inventory_qty: Number(v.inventory_quantity) || 0,
        updated_at: new Date().toISOString(),
      });
    }
  }
  if (variantRows.length) {
    const { error } = await svc.from('product_variants').upsert(variantRows, { onConflict: 'business_id,sku' });
    if (error) throw error;
  }

  await svc.from('api_credentials').update({ is_valid: true, last_verified: new Date().toISOString() })
    .eq('business_id', businessId).eq('platform', 'shopify').eq('user_id', userId);

  return { business_id: businessId, products: productRows.length, variants: variantRows.length };
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

    const { data: userData } = await svc.auth.getUser(token);
    const user = userData.user;
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (!body.business_id) return json({ error: 'business_id required' }, 400);

    const { data: cred } = await svc.from('api_credentials')
      .select('credentials').eq('business_id', body.business_id).eq('platform', 'shopify').eq('user_id', user.id).maybeSingle();
    if (!cred) return json({ error: 'Shopify not connected for this business' }, 404);

    const result = await syncBusiness(svc, user.id, body.business_id, cred.credentials);
    return json({ success: true, ...result });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
