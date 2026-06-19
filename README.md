# Apex Finance

Finance & cost-management system for your businesses — **web + desktop**, sharing one
Supabase cloud database. Same Apex look; ports Apex's profit engine and financial
statements. Computes exact profit from your revenue, ad spend, costs, assets, liabilities,
and dividends.

## Status

- **Phase 1 (done):** Auth (email + password + RLS), multiple businesses, manual data
  entry + CSV import, per-order/per-product/fixed costs, assets/liabilities/equity/dividends,
  exact profit, and statements (Income Statement, Balance Sheet, Cash Flow, Break-Even, Ratios).
- **Phase 2 (next):** Live Shopify + Meta auto-sync via Supabase Edge Functions.
- **Phase 3 (next):** Electron desktop packaging + GitHub Pages deploy.

## One-time setup

1. **Create the database tables.** Open the Supabase SQL editor and run
   [`supabase/schema.sql`](supabase/schema.sql):
   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
   This creates every table and enables Row-Level Security so only you can read your data.

2. **(Recommended) Turn off email confirmation for faster sign-in** while it's just you:
   Supabase dashboard → Authentication → Providers → Email → disable "Confirm email".

3. Install and run:
   ```
   npm install
   npm run dev
   ```
   Sign up with an email + password, then create your first business.

## Build

```
npm run build         # production web build → dist/
npm run preview       # preview the built app
DEPLOY_TARGET=pages npm run build   # build with the /ApexFinance/ base path for GitHub Pages
```

## Security model

- All finance data is keyed to your `auth.uid()` and protected by RLS — a second account
  sees zero of your rows.
- The Supabase anon key in the client is public by design; it only grants what RLS allows.
- Shopify/Meta API tokens (Phase 2) live only in Supabase and are used inside Edge Functions —
  never shipped in the web bundle.
- Honest limitation: on free static hosting the web JavaScript is public; protection rests on
  data/RLS/secrets, not code secrecy.

## Project layout

```
src/finance/        ported pure math: profit-engine, ltv-engine, statements, compute
src/services/db.ts  typed Supabase CRUD (auto-injects user_id)
src/stores/         zustand: auth, businesses, settings
src/components/      ui/ (shadcn), layout/, shared/, finance/ (tabs), auth/
src/pages/          Dashboard, Businesses, BusinessDetail, Settings
supabase/schema.sql Postgres schema + RLS
```
