// Edge Function: sync-meta
// Pulls daily Meta (Facebook) ad insights for a business and writes ad spend
// (and conversion value) into metrics_cache. Ported from electron/services/meta.ts.
//
// Two modes (same as sync-shopify): user-triggered (JWT + business_id) and
// cron-triggered (service-role key, syncs all Meta connections).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const META_API_VERSION = 'v19.0';
interface MetaCreds { accessToken: string; adAccountId: string }

function dateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function syncBusiness(svc: any, userId: string, businessId: string, creds: MetaCreds, days: number) {
  const { start, end } = dateRange(days);
  const accountId = String(creds.adAccountId).replace(/^act_/, '');

  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights`);
  url.searchParams.set('access_token', creds.accessToken);
  url.searchParams.set('time_range', JSON.stringify({ since: start, until: end }));
  url.searchParams.set('time_increment', '1');
  url.searchParams.set('level', 'account');
  url.searchParams.set('fields', 'spend,impressions,clicks,actions,action_values');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta ${res.status}: ${await res.text()}`);
  const body = await res.json();

  const rows: any[] = [];
  for (const insight of body.data || []) {
    const date = insight.date_start;
    const spend = parseFloat(insight.spend || '0');
    const purchaseValue = parseFloat(
      (insight.action_values || []).find((a: any) => a.action_type === 'purchase')?.value || '0',
    );
    rows.push(
      { user_id: userId, business_id: businessId, platform: 'meta', metric_date: date, metric_type: 'meta_spend', metric_value: spend },
      { user_id: userId, business_id: businessId, platform: 'meta', metric_date: date, metric_type: 'meta_conversion_value', metric_value: purchaseValue },
    );
  }
  if (rows.length) {
    const { error } = await svc.from('metrics_cache').upsert(rows, { onConflict: 'business_id,platform,metric_date,metric_type' });
    if (error) throw error;
  }
  await svc.from('api_credentials').update({ is_valid: true, last_verified: new Date().toISOString() })
    .eq('business_id', businessId).eq('platform', 'meta').eq('user_id', userId);

  return { business_id: businessId, days_written: (body.data || []).length, range: { start, end } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const body = await req.json().catch(() => ({}));
    const days = body.days ?? 30;

    if (token && token === serviceKey && !body.business_id) {
      const { data: creds } = await svc.from('api_credentials').select('business_id, user_id, credentials').eq('platform', 'meta');
      const results = [];
      for (const c of creds || []) {
        try { results.push(await syncBusiness(svc, c.user_id, c.business_id, c.credentials, days)); }
        catch (e) { results.push({ business_id: c.business_id, error: String(e instanceof Error ? e.message : e) }); }
      }
      return json({ success: true, mode: 'cron', synced: results.length, results });
    }

    // User mode: the app runs with login disabled (no real Supabase Auth session),
    // so identify the caller by the business's own stored credential row instead
    // of a JWT-bound user — consistent with the app's no-login/open_access model.
    if (!body.business_id) return json({ error: 'business_id required' }, 400);

    const { data: cred } = await svc.from('api_credentials')
      .select('user_id, credentials').eq('business_id', body.business_id).eq('platform', 'meta').maybeSingle();
    if (!cred) return json({ error: 'Meta not connected for this business' }, 404);

    const result = await syncBusiness(svc, cred.user_id, body.business_id, cred.credentials, days);
    return json({ success: true, ...result });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
