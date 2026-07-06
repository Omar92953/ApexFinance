# Phase 2 — Live Shopify + Meta sync setup

The app UI (Integrations tab) and the sync Edge Functions are built. To turn on live
sync you need to (a) deploy the two functions, (b) optionally schedule auto-sync, and
(c) get an access token from Shopify and Meta. Steps below.

## A. Deploy the Edge Functions

The functions automatically get `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from
Supabase — no secrets to set manually.

### Option 1 — Supabase CLI (recommended)
```bash
npm install -g supabase
supabase login                       # opens browser to authorize
supabase link --project-ref gyqqrbchpepvchjgweep
supabase functions deploy sync-shopify
supabase functions deploy sync-meta
```

### Option 2 — Dashboard
Dashboard → **Edge Functions** → **Create function** → name it `sync-shopify`, paste the
contents of `supabase/functions/sync-shopify/index.ts`, deploy. Repeat for `sync-meta`
(paste `sync-meta/index.ts`). Also create `_shared/cors.ts` if the editor supports it,
or inline its two exports at the top of each function.

## B. (Optional) Turn on automatic sync every 15 min
1. Dashboard → **Project Settings → API** → copy the **service_role** secret.
2. Open the SQL editor, paste `supabase/schedule.sql`.
3. Uncomment the `vault.create_secret(...)` line, paste your service_role key, run it once,
   then re-comment it. Run the rest to create the two cron jobs.
4. Check it's working: `select * from cron.job;` and later `select * from cron.job_run_details order by start_time desc;`

(Without this step, sync still works — just click **Sync now** in the app's Integrations tab.)

## C. Get your access tokens

### Shopify (Admin API token)
1. Shopify admin → **Settings → Apps and sales channels → Develop apps**.
2. **Create an app** (e.g. "Apex Finance"), then **Configure Admin API scopes** →
   enable at least **read_orders** (and `read_products` if you want product data later).
3. **Install app**, then reveal the **Admin API access token** (`shpat_...`).
4. In Apex Finance → your business → **Integrations → Shopify**: enter your store URL
   (`your-store.myshopify.com`) and the token → **Connect** → **Sync now**.

### Meta (Marketing API token)
1. Go to **developers.facebook.com** → your app (or create one) → **Marketing API**.
2. Generate an access token with **ads_read** permission (a long-lived/system-user token
   is best so it doesn't expire).
3. Get your **Ad Account ID** (the number, without the `act_` prefix) from Ads Manager.
4. In Apex Finance → **Integrations → Meta**: enter the Ad Account ID and token →
   **Connect** → **Sync now**.

## CRM (customers) setup
1. **Create the CRM tables**: run `supabase/crm_schema.sql` once in the SQL editor
   (contacts, notes, activity, deals, tasks — all with RLS).
2. **Deploy the customer import function** (same as the others):
   `supabase functions deploy sync-shopify-customers`
3. In a business → **Customers** tab → **Import from Shopify** pulls customer name,
   email, phone, city/country, tags, total spent, orders count, marketing consent.
   You can also **Add contact** manually. (Meta cannot provide customer emails — only
   Shopify + manual + UTM attribution.)

## What syncs
- **Shopify** → `gross_sales`, `net_sales`, `orders`, `units_sold` per day.
- **Meta** → `meta_spend`, `meta_conversion_value` per day.

These flow straight into the profit engine, so the Overview KPIs and Statements fill in
automatically. Manual entries (Data tab) still work alongside — sync only overwrites the
Shopify/Meta platform rows, not your manual ones.

## Security notes
- Tokens are stored in `api_credentials` and read **only** by the Edge Functions via the
  service-role key. The app never selects the token column back to the browser (see
  `credentialsApi` in `src/services/db.ts`).
- Optional hardening: add a column-level `REVOKE SELECT (credentials)` grant so even a
  crafted client query can't read tokens; the functions (service role) bypass it.
