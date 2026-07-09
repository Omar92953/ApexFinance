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
supabase functions deploy sync-shopify-products
supabase functions deploy sync-shopify-customers
supabase functions deploy sync-meta
```

### Option 2 — Dashboard
Dashboard → **Edge Functions** → **Create function** → name it `sync-shopify`, paste the
contents of `supabase/functions/sync-shopify/index.ts`, deploy. Repeat for `sync-shopify-products`,
`sync-shopify-customers`, and `sync-meta` (paste each matching `index.ts`). Also create
`_shared/cors.ts` if the editor supports it, or inline its two exports at the top of each function.

## B. (Optional) Turn on automatic sync
Orders + ad spend sync every 15 min; products + customers sync once daily (they change
far less often).
1. Dashboard → **Project Settings → API** → copy the **service_role** secret.
2. Open the SQL editor, paste `supabase/schedule.sql`.
3. Uncomment the `vault.create_secret(...)` line, paste your service_role key, run it once,
   then re-comment it. Run the rest to create the four cron jobs.
4. Check it's working: `select * from cron.job;` and later `select * from cron.job_run_details order by start_time desc;`

(Without this step, sync still works — just click **Sync** next to each data type in the
app's Integrations tab.)

## C. Get your access tokens

### Shopify (Admin API token)
1. Shopify admin → **Settings → Apps and sales channels → Develop apps**.
2. **Create an app** (e.g. "Apex Business Manager"), then **Configure Admin API scopes** →
   enable **read_orders**, **read_products**, **read_inventory** (needed for variant cost),
   and **read_customers**.
3. **Install app**, then reveal the **Admin API access token** (`shpat_...`).
4. In Apex Business Manager → your business → **Setup → Integrations → Shopify**: enter your
   store URL (`your-store.myshopify.com`) and the token → **Connect** → run each **Sync** button
   (Orders & sales, Products & cost, Customers).

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
2. Deploy `sync-shopify-customers` (see step A above) and click its **Sync** button in
   Integrations, or wait for the daily cron. Pulls customer name, email, phone,
   city/country, tags, total spent, orders count, marketing consent into the CRM contact
   list. You can also **Add contact** manually. (Meta cannot provide customer emails —
   only Shopify + manual + UTM attribution.)

## Products & stock (Phase 3) setup
1. Run `supabase/phase3_shopify_sync.sql` once in the SQL editor — adds a stable dedupe
   key so repeated syncs never create duplicate order lines or double-decrement stock.
2. Deploy `sync-shopify-products` (see step A above) and click **Sync** — pulls your full
   catalog with real cost per item (from Shopify's inventory items) and current stock.
3. From then on, every **Orders & sales** sync also writes `order_line_items` (feeding
   per-SKU COGS, stock health, and auto-LTV) and **auto-decrements stock** on each new
   sale — a repeated sync never double-counts, so it's safe to run on a schedule.

## What syncs
- **Shopify orders** → `gross_sales`, `net_sales`, `orders`, `units_sold` per day, plus
  per-order line items and stock deduction.
- **Shopify products** → catalog, price, real cost per item, stock quantity.
- **Shopify customers** → CRM contacts.
- **Meta** → `meta_spend`, `meta_conversion_value` per day.

These flow straight into the profit engine, so the Overview KPIs, Cost Explorer, and
Statements fill in automatically. Manual entries (Data tab) still work alongside — sync
only overwrites the platform-sourced rows, not your manual ones.

## Security notes
- Tokens are stored in `api_credentials` and read **only** by the Edge Functions via the
  service-role key. The app never selects the token column back to the browser (see
  `credentialsApi` in `src/services/db.ts`).
- Optional hardening: add a column-level `REVOKE SELECT (credentials)` grant so even a
  crafted client query can't read tokens; the functions (service role) bypass it.
