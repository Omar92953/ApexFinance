# Apex Business Manager — Project Guide

## 📝 Project Summary

Apex Business Manager is a **business management platform** for Omar's e-commerce
businesses (currently: a Shopify keychain store) — evolving from a finance tracker
into a full **ERP** (Enterprise Resource Planning) system, per the master plan.

### Purpose & Functionality
- **Finance & Cost Management**: Exact net profit from real revenue, COGS, ad spend,
  shipping, and a full **Cost Rules Engine** (category + allocation basis + scope +
  effective dates) — not a flat per-order/per-product guess.
- **Double-entry General Ledger**: Every cash movement (expenses, transfers,
  manufacturing) auto-posts a balanced journal entry. Real Trial Balance, GL-derived
  Income Statement & Balance Sheet.
- **Inventory & Manufacturing**: Product catalog (Shopify CSV/API import), per-variant
  WAC (Weighted Average Cost), stock health indicators, manufacturing batches that
  debit capital + credit inventory automatically, per-SKU unit economics.
- **CRM**: Contacts (from Shopify or manual), notes, activity timeline, deal pipeline,
  tasks.
- **Multi-platform**: One React codebase ships as a **website** (GitHub Pages), a
  **desktop app** (Electron), and works on **phone** (PWA-style mobile layout) — all
  sharing one Supabase database, so data is always in sync.
- **No login (currently)**: runs on a single shared identity — see
  [No-Login Architecture](#-critical-architecture-facts) below. This is a deliberate,
  revisitable choice, not an oversight.

---

## 🤖 Instructions for AI Agents

> [!IMPORTANT]
> **Mandatory Workflow**: Any AI agent working on this project **MUST** follow these steps:
> 1. **Describe the Problem**: Record the issue in the "Session Record" at the end of
>    this file **BEFORE** starting work (or, for a new feature, describe what's being built).
> 2. **Propose Solution**: Define the intended approach. If a solution fails, label it
>    "DID NOT WORK" and try again — don't silently abandon the record.
> 3. **Execute & Verify**: Implement, then verify with `npm test` + `npm run build`
>    (and, ideally, a live click-through) before considering it done.
> 4. **Record Solution**: Document the final fix/feature in the same session record entry.

> [!CAUTION]
> **Persistence Policy**: DO NOT delete or alter previous session records. This guide
> is a permanent log of the app's evolution and troubleshooting.

> [!NOTE]
> **File Organization**: New files **MUST** be added to the
> [Folder Structure](#-folder-structure) section immediately.

> [!CAUTION]
> **Supabase schema changes are NOT automatic.** The anon key cannot run DDL. Every
> new table/column ships as a **self-contained `.sql` file** in `supabase/` that Omar
> pastes into the SQL editor himself. Always: copy it to his clipboard and open the
> SQL editor for him (see [Deploy Playbook](#-deploy-playbook)), then tell him plainly
> what to do. Never assume a migration ran — ask or check before relying on new
> tables/columns existing.

**Guidelines for Agents:**
- Be concise but technical (Symptom, Root Cause, Fix — or Feature, Why, What Changed).
- Category labels: (CRITICAL), (MINOR), (BUILD), (DEV), (UX), (FEATURE), (ERP-Pn) where n = plan phase number.
- **Maintain Chronological Order**: Add new entries to the **BOTTOM** of the session record.

---

## 🧠 Shared Brain Protocol

> [!IMPORTANT]
> **Design Tokens (inherited from the original Apex app)**
> - Dark-first theme, near-black backgrounds, **cobalt-blue primary** (`hsl(221 83% 53%)` light / `hsl(217 91% 60%)` dark).
> - Tokens live in `src/styles/globals.css` as HSL CSS vars (`--primary`, `--chart-1..5`, etc.) — Tailwind maps them in `tailwind.config.cjs`. Never hardcode hex; use the token.
> - Radius: `0.75rem` default. Font: Inter, tabular numerals for all money/number displays (`font-variant-numeric: tabular-nums`).
> - Frameless window with a custom `TitleBar` — only renders when `window.electronAPI` exists (desktop); hidden on web.

> [!IMPORTANT]
> **Coding Standards**
> - **Layering**: UI components → `src/services/db.ts` (typed `*Api` objects, all Supabase access) → `src/finance/*` (pure, tested business math). **Never** put a raw `supabase.from(...)` call inside a component — always go through a `*Api` object in `db.ts`.
> - **Pure + tested**: business logic (profit math, cost rules, ledger, stock health, LTV) lives in `src/finance/*.ts` with **zero** Supabase/DOM imports, and has a matching `*.test.ts` file. Run `npm test` before calling anything done.
> - **Currency**: the app is **EGP-only** (see decision log below). `formatCurrency`/`formatCurrencyRounded`/`getCurrencySymbol` in `src/lib/utils.ts` default to `'EGP'`.
> - **No breaking changes**: additive by default. New tables get their own migration file; new GL/cost-rule logic wraps existing flows in `try/catch` so a failure in the new path never blocks the underlying action (see `capitalApi.recordTransaction`'s GL auto-post for the pattern).
> - **Atomic multi-table writes** go through a Postgres RPC (`supabase.rpc(...)`), not sequential client calls — see `post_journal_entry`. This is required whenever an operation must not be left half-done.

> [!IMPORTANT]
> **Mandatory Verification Checklist** — before calling any task done:
> 1. `npm test` — all vitest suites green (currently 40 tests across stock-health, cost-rules, ledger).
> 2. `npm run build` — `tsc && vite build` clean, no type errors.
> 3. If UI changed: rebuild the desktop app (`npm run build:electron`) and relaunch it to eyeball the change.
> 4. Commit + push → confirm the GitHub Actions web deploy run finishes with `success` (don't just push and assume).
> 5. If a new/changed SQL file exists: copy it to Omar's clipboard and open the SQL editor tab for him — never assume he'll go find it himself.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 |
| Styling | TailwindCSS 3.4 + ShadCN/Radix UI (`.cjs` configs — project is ESM) |
| State | Zustand (auth, business list, settings) |
| Charts | Recharts 2.12 (first used in Cost Explorer's trend chart) |
| Animation | Framer Motion 11 |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions + `pg_cron`) |
| Testing | Vitest (pure `src/finance/*` logic only — no component tests yet) |
| Desktop Shell | Electron 31 (frameless window, custom TitleBar, `.cjs` main/preload — no build step) |
| Desktop Packaging | electron-builder → Windows NSIS `.exe` |
| Web Hosting | GitHub Pages, auto-deployed via GitHub Actions on push to `main` |
| Edge Functions | Deno (Supabase Edge Functions) — Shopify/Meta sync |

---

## 📐 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer (React + Tailwind)      src/pages/, src/components/│
├──────────────────────────────────────────────────────────────┤
│  State Layer (Zustand)                          src/stores/  │
├──────────────────────────────────────────────────────────────┤
│  Data Layer — typed *Api objects       src/services/db.ts    │  ← ALL Supabase access goes through here
├──────────────────────────────────────────────────────────────┤
│  Business Logic (pure, tested)                src/finance/   │  ← profit, cost rules, ledger, stock health, LTV
├──────────────────────────────────────────────────────────────┤
│  Supabase (Postgres + RLS + RPC + Edge Functions)             │
└──────────────────────────────────────────────────────────────┘

Same React build → 3 targets:
  Web:     Vite base '/ApexFinance/' → GitHub Pages (public repo, auto-deploy)
  Desktop: Vite base './'            → Electron (electron/main.cjs loads dist/index.html)
  Phone:   same web build, mobile-responsive layout (MobileHeader/MobileNav)
```

**Data flow example (manufacturing batch):** `ManufacturingTab.tsx` → `manufacturingApi.createBatch()` in `db.ts` → inserts batch + cost items + inventory movement → `capitalApi.recordTransaction()` (debits cash) → auto-posts a GL entry via `glApi.postEntry()` → `post_journal_entry` RPC validates balance atomically → updates variant WAC/stock. One user action, five tables, one atomic ledger guarantee.

---

## 🔑 Critical Architecture Facts

> [!CAUTION]
> **No-login mode.** Real Supabase Auth (email+password) was built, then **deliberately
> disabled** so the app opens straight to the dashboard. `src/stores/authStore.ts` is a
> stub returning a fixed `LOCAL_USER_ID` (`00000000-0000-0000-0000-000000000001`) —
> there is no real session, no real `auth.users` row. Every table's RLS uses a
> **permissive `open_access` policy** (`to anon, authenticated using (true)`), and
> every `user_id` column has **no FK to `auth.users`** (dropped where it existed).
> **Consequence for new tables**: `user_id uuid not null` with NO auth FK, plus an
> `open_access` policy — copy the pattern from any recent `*_schema.sql`, or inserts
> will 409. **Consequence for new Edge Functions**: never call `svc.auth.getUser(token)`
> expecting it to resolve — it won't (the client sends the anon key, not a user JWT).
> Identify the caller from the resource's own stored `user_id` column instead (see the
> fix in `supabase/functions/sync-shopify/index.ts`). This bit us once already — a
> subtle "works until you actually click the button" bug (see Session Record #12).
> **Security tradeoff, accepted by Omar**: since the web bundle is public (free
> GitHub Pages) and login is off, anyone with the URL can read/write the data today.
> Re-enabling login is on the backlog, not yet scheduled.

> [!CAUTION]
> **EGP-only.** Multi-currency support exists in `utils.ts` infrastructure but is
> **not exposed anywhere in the UI** — no currency picker, all defaults are `'EGP'`.
> Don't re-add a currency selector without being asked; Omar explicitly removed it.

> [!IMPORTANT]
> **SQL handoff pattern.** The anon key can't run DDL. Every schema change is a new,
> **self-contained, idempotent** `.sql` file in `supabase/` (creates tables +
> `open_access` policies + indexes, safe to re-run). After writing one: copy it to
> Omar's clipboard (`Set-Clipboard`) and open the SQL editor
> (`https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new`) so he can
> paste-and-run in one motion. **Do not consider a feature "done" until he's
> confirmed the SQL ran** — track this explicitly, it's a common half-finished state.

> [!IMPORTANT]
> **Deploy pipeline.** Push to `main` → GitHub Actions builds (`DEPLOY_TARGET=pages`)
> and deploys to GitHub Pages automatically. For desktop: `npm run build:electron`
> then relaunch `node_modules\electron\dist\electron.exe .` (launching via
> `electron.cmd`/`Start-Process` directly can misfire as plain Node — always invoke
> the real binary path). Always confirm the Actions run finished with `success`
> before telling Omar it's live — don't just push and assume.

> [!IMPORTANT]
> **Edge Functions need separate deployment** (`supabase functions deploy <name>`) —
> pushing to git does NOT deploy them. Omar has the Supabase CLI installed and logged
> in on his machine (`supabase --version` → 2.109.1, project already linked). I can
> run `supabase functions deploy` myself once he's logged in for a session; I cannot
> run `supabase login` (interactive OAuth) for him.

> [!IMPORTANT]
> **Atomicity via RPC.** Any write touching multiple tables that must not be left
> half-done goes through a Postgres function (`supabase.rpc(...)`), not sequential
> client calls. Currently: `post_journal_entry` (GL). Follow this pattern for any
> future multi-table atomic write (e.g. a future PO-receiving flow).

> [!NOTE]
> **Reused from the original Apex app (MetaShopifyTracker)**: `profit-engine.ts`
> (copied verbatim, pure), `ltv-engine.ts` (refactored to take a plain orders array),
> `financialStatements.ts` → `statements.ts` (pure), `globals.css`/Tailwind tokens,
> shadcn `ui/` components, the Apex logo. **Not reused**: SQLite, Electron IPC data
> layer, encryption (replaced by Supabase RLS).

---

## 🗺️ ERP Master Plan — Status

Full 10-phase plan lives at `C:\Users\omarm\.claude\plans\using-exactly-the-same-dreamy-catmull.md`.

| Phase | Scope | Status |
|---|---|---|
| 1 | Section-based nav, EGP-only, merged Net Profit KPI, MER, auto-LTV, stock health | ✅ Done |
| 2 | Cost Rules Engine (category/basis/scope/effective-dates), Cost Explorer, budgets, trend chart, what-if simulator, unit economics | ✅ Done |
| 3 | Full Shopify auto-sync — products+cost+stock, orders write line items + auto-decrement stock | ✅ Code done, functions deployed; **blocked on Omar creating a Shopify app** (not done yet) |
| 4 | Double-entry General Ledger — chart of accounts, atomic RPC, Trial Balance, GL statements, auto-posting | ✅ Done — **`gl_schema.sql` needs Omar to run it** |
| 5 | Finance 2.0 — budgeting, goals, 13-week cash-flow forecast, month-close, drawings tracking, profitability reports | ✅ Done — **`finance2_schema.sql` needs Omar to run it** |
| 6 | Procurement & Purchasing — suppliers, POs, receiving, AP, reorder suggestions | ✅ Done — **`purchasing_schema.sql` needs Omar to run it** |
| 7 | Sales, AR, Returns & COD reconciliation | ✅ Done — **`sales_schema.sql` needs Omar to run it** |
| 8 | CRM 2.0 — RFM segmentation, tickets, pipeline analytics, WhatsApp/call links, dedupe | ✅ Done — **`crm2_schema.sql` needs Omar to run it** |
| 9 | Manufacturing BOM/MRP-lite + simple HR/Payroll | Not started |
| 10 | Command dashboard, audit trail, alerts, exports | Not started |

Also delivered outside the numbered phases: full **CRM** (contacts/notes/activity/deals/tasks), the original **Capital/Costs/Inventory overhaul** (products, WAC, manufacturing, capital ledger — predates the ERP plan and is what Phase 2/4 built on top of).

---

## 📁 Folder Structure

```
ApexFinance/
├── electron/
│   ├── main.cjs                    # Window + IPC (no build step, plain CommonJS)
│   └── preload.cjs                 # Exposes window.electronAPI.window (min/max/close)
├── src/
│   ├── main.tsx                    # Entry (HashRouter)
│   ├── App.tsx                     # Routes
│   ├── lib/
│   │   ├── supabase.ts             # Supabase client (anon key)
│   │   ├── asset.ts                # Base-path-aware asset URLs (web vs electron)
│   │   └── utils.ts                # cn(), formatCurrency (EGP default), formatNumber
│   ├── stores/
│   │   ├── authStore.ts            # STUB — LOCAL_USER_ID, no real session (see Critical Facts)
│   │   ├── businessStore.ts        # Business list (Zustand)
│   │   └── settingsStore.ts        # Theme only (currency removed)
│   ├── services/
│   │   └── db.ts                   # ALL Supabase access — every *Api object lives here
│   ├── finance/                    # Pure, tested business logic
│   │   ├── profit-engine.ts        # Core profit calc (ported from original Apex)
│   │   ├── ltv-engine.ts           # LTV/cohort predictions from order history
│   │   ├── statements.ts           # Income Statement/Balance Sheet/Cash Flow (manual financial_inputs-based)
│   │   ├── compute.ts              # Orchestrates: landed costs, cost rules, auto-LTV → ProfitEngine.calculate()
│   │   ├── cost-rules.ts (+.test)  # Cost Rules Engine: category/basis/scope/proration
│   │   ├── ledger.ts (+.test)      # Double-entry math: balance check, Trial Balance, GL statements
│   │   └── stock-health.ts (+.test) # Days-of-cover classification
│   ├── components/
│   │   ├── auth/AuthPage.tsx       # Unused while login is disabled, kept for when it's re-enabled
│   │   ├── layout/                 # MainLayout, Sidebar, TitleBar, MobileHeader, MobileNav
│   │   ├── shared/KpiCard.tsx
│   │   ├── ui/                     # shadcn primitives
│   │   ├── finance/                # Overview, Capital, Costs (Explorer), Statements, Integrations, GL, dialogs
│   │   ├── inventory/               # Products, Unit Economics, Manufacturing, Cost Breakdown dialog
│   │   └── crm/                    # Customers, Deals, Tasks, Contact Detail dialog
│   └── pages/
│       ├── DashboardPage.tsx       # Global overview across all businesses
│       ├── BusinessesPage.tsx      # Business list/create (name-only form, EGP+owner forced)
│       ├── BusinessDetailPage.tsx  # Section-tabbed workspace (Overview/Finance/Inventory/CRM/Setup)
│       └── SettingsPage.tsx        # Theme toggle, static EGP label, sign-out (vestigial)
├── supabase/
│   ├── schema.sql                  # Original Phase-1 schema (businesses, costs, financial_inputs, CRM base…)
│   ├── open_access.sql             # MASTER list of no-login policies — re-run after adding tables
│   ├── crm_schema.sql / products_schema.sql / capital_schema.sql / manufacturing_schema.sql
│   ├── overhaul_all.sql            # Combined A+B+C overhaul (products/capital/manufacturing) — historical, already run
│   ├── cost_breakdown_fix.sql      # Widened legacy product_cost_items constraints
│   ├── cost_rules_schema.sql       # Phase 2: cost_rules, cost_budgets
│   ├── phase3_shopify_sync.sql     # Phase 3: dedupe keys for line items + inventory movements
│   ├── gl_schema.sql               # Phase 4: chart_of_accounts, journal_entries/lines, post_journal_entry RPC — NOT YET RUN
│   ├── egp_backfill.sql            # One-time currency normalization
│   ├── schedule.sql                # pg_cron jobs (orders/meta 15min, products/customers daily)
│   ├── PHASE2_SETUP.md             # Omar's setup steps: Edge Function deploy + Shopify/Meta tokens
│   └── functions/
│       ├── _shared/cors.ts
│       ├── sync-shopify/           # Orders → metrics + order_line_items + stock auto-decrement
│       ├── sync-shopify-products/  # Catalog + real cost (via inventory_items) + stock qty
│       ├── sync-shopify-customers/ # → CRM contacts
│       └── sync-meta/              # Ad spend + conversions
├── PROJECT_GUIDE.md                # This file
├── README.md                       # Setup/build instructions
└── package.json                    # scripts: dev, build, test, build:electron, electron:build
```

---

## 🚀 Deploy Playbook

**Web + desktop, every change:**
```powershell
npm test                          # must be green
npm run build                     # must be clean
npm run build:electron            # relaunch: node_modules\electron\dist\electron.exe .
git add -A && git commit -m "..." && git push origin main
# then poll: gh actions run status until "success" (or via API — see prior sessions)
```

**New SQL file:**
```powershell
Set-Clipboard -Value (Get-Content "supabase\<file>.sql" -Raw)
Start-Process "https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new"
# tell Omar: "Ctrl+V → Run"
```

**New/changed Edge Function** (only if Omar has an active `supabase login` session):
```powershell
supabase functions deploy <function-name>
```

---

## ⚠️ Troubleshooting & Session Record

### Resolved Problems / Milestones (Chronological)

#### 1. App scaffold + finance engine port (FEATURE)
Built the Vite+React+Supabase skeleton from scratch, ported `profit-engine.ts`,
`ltv-engine.ts`, `statements.ts` from the original Apex (MetaShopifyTracker) app,
verbatim where pure. Auth = real Supabase email+password + RLS (later disabled, see #9).

#### 2. Web + desktop + mobile shipped (FEATURE)
GitHub Pages deploy (Actions on push to `main`), Electron desktop wrapper
(`electron/main.cjs`/`preload.cjs`, no build step), mobile-responsive layout
(`MobileHeader`/`MobileNav`). Branded apple-touch-icon for "Add to Home Screen".

#### 3. Live Shopify/Meta sync — Edge Functions (FEATURE)
`sync-shopify`, `sync-meta` Edge Functions (dual mode: user JWT / cron via
service-role key), `pg_cron` schedule, Integrations tab.

#### 4. Renamed to "Apex Business Manager" + CRM added (FEATURE)
Full CRM: contacts (Shopify import + manual), notes, activity timeline, deal
pipeline, tasks. `sync-shopify-customers` Edge Function.

#### 5. Login disabled (CRITICAL — architecture decision)
Switched to no-login mode for frictionless single-user access. See
[Critical Architecture Facts](#-critical-architecture-facts) — this is the single
most important fact for any future work on this codebase.

#### 6. Capital/Costs/Inventory overhaul (FEATURE)
Product catalog + Shopify CSV import, per-product COGS + shipping zones, WAC
costing, capital accounts + transaction ledger, manufacturing batches
(debit capital → add stock → update WAC). Predates and underlies the ERP plan.

#### 7. Cost breakdown + ledger filters (FEATURE)
Per-product cost breakdown (materials/labor/packaging) rolling up into
`cost_per_item`. Capital transaction log filters (account/type/date range).

#### 8. Bulk edit + stock management in Products (FEATURE)
Row selection + bulk-set cost/price/stock; inline stock editing with logged
inventory adjustments.

#### 9. CSV parser hardened for newer Shopify export format (MINOR)
**Symptom:** Real Shopify export ("Keychains import…") used `URL handle`/`SKU`/`Price`
instead of classic `Handle`/`Variant SKU`/`Variant Price`. **Fix:** `pick()` helper
tries multiple header name variants; handle derived from title if missing.

#### 10. ERP master plan approved — Phase 1 (FEATURE / ERP-P1)
Section-based nav (Overview/Finance/Inventory/CRM/Setup), EGP-only, merged Net
Profit + Your Profit into one KPI, added MER, renamed CAC, auto-computed LTV from
real order history, stock health indicator (`stock-health.ts`, first vitest suite).

#### 11. Cost Rules Engine (FEATURE / ERP-P2)
Replaced flat per-order/per-product/fixed costs with category+basis+scope+
effective-dates rules (`cost-rules.ts`, tested). Cost Explorer UI, budget vs
actual, 6-month trend chart (first Recharts usage), what-if simulator, per-SKU
Unit Economics tab. Legacy `additional_costs` auto-migrated into rules.

#### 12. Edge Function auth bug — manual "Sync" always 401'd (CRITICAL)
**Symptom:** Every manual "Sync" button click in Integrations would fail once
actually tested against deployed functions. **Root Cause:** all 4 sync functions'
user-mode branch called `svc.auth.getUser(token)`, but login has been disabled
since #5 — the browser sends the **anon key**, not a real user JWT, so
`getUser()` always returned null. This was latent since #3/#4 (never actually
exercised until Omar deployed and I smoke-tested). **Fix:** identify the caller
from the `api_credentials` row's own stored `user_id` instead of a JWT-bound
user. Verified via direct API call (anon key → correct 404 "not connected"
instead of 401). **Lesson**: never assume `svc.auth.getUser()` resolves in this
app — see [Critical Architecture Facts](#-critical-architecture-facts).

#### 13. Full Shopify auto-sync incl. products + stock decrement (FEATURE / ERP-P3)
New `sync-shopify-products` function (paginated products + batched
`inventory_items` for real per-variant cost). `sync-shopify` (orders) extended
to upsert `order_line_items` and auto-decrement stock via deduped `sale_out`
inventory movements (safe to re-run — dedupe keys added in `phase3_shopify_sync.sql`).
`sync-shopify-customers` gained cron mode. Integrations UI split into
per-data-type sync buttons. **Blocked**: Omar hasn't created a Shopify app yet,
so this is unverified against real data.

#### 14. Double-entry General Ledger (FEATURE / ERP-P4)
26-account default chart of accounts, atomic `post_journal_entry` RPC (rejects
unbalanced entries server-side), `ledger.ts` pure engine (12 tests: balance
check, Trial Balance aggregation, GL-derived Income Statement/Balance Sheet).
Auto-posting wired into `capitalApi.recordTransaction`/`transfer` and
`manufacturingApi.createBatch` (all wrapped in try/catch — additive, never
blocks the underlying action). New General Ledger tab: Trial Balance, GL
statements, journal browser, manual entry dialog, one-time opening-balance
conversion from legacy `financial_inputs`. **`gl_schema.sql` written and handed
off to Omar — not yet confirmed run.**

#### 15. PROJECT_GUIDE.md created (DEV)
This file — created retroactively to capture the accumulated architecture
decisions and gotchas from an already-substantial build, before continuing into
Phase 5.

#### 16. Finance 2.0 (FEATURE / ERP-P5)
New `forecast.ts` pure engine (tested — 5 cases) for a 13-week cash-flow
projection: starting balance from capital accounts, avg daily net cash from
trailing 30 days, weekly-equivalent recurring fixed cost rules. `period_closes`
table + one-time "Close month" snapshot button (informational only — does
**not** lock edits to closed periods, a deliberate scope cut to avoid invasive
checks across many write paths for uncertain payoff right now). New **Goals**
tab (reuses the original `business_goals`/`goalsApi` — no new table needed):
monthly targets for revenue/net profit/orders/MER with live progress bars.
New **Profitability** tab: profit-by-product ranking (units sold × contribution
margin per unit), 6-month P&L trend chart, 13-week cash-flow forecast chart
with a "cash runs out in week N" warning badge, month-close history. **Owner
Drawings** quick action added to Capital tab (already had GL mapping to
Owner's Drawings 3030 from Phase 4, just needed a UI button) + "Drawn this
year" stat. **Deliberately skipped** from the original Phase 5 scope:
"recurring transactions auto-post" — the Cost Rules Engine already accrues
fixed costs into the profit calculation every period without a real cash
transaction; auto-posting phantom GL entries for the same rules on a timer
would double-count against real Capital-recorded payments and wasn't a good
fit for this architecture. **`finance2_schema.sql` written and handed off —
not yet confirmed run.**

#### 17. Procurement & Purchasing (FEATURE / ERP-P6)
`reorder.ts` pure engine (tested — 4 cases): target-stock/reorder-qty math.
`purchasing_schema.sql`: suppliers, purchase_orders/lines, goods_receipts/lines,
supplier_bills, bill_payments + two atomic RPCs — `receive_purchase_order`
(updates PO lines, inventory movement + WAC, creates supplier bill, posts
Dr Inventory/Cr AP, all in one transaction) and `pay_supplier_bill` (debits
bill balance, credits capital account, posts Dr AP/Cr Cash). New tabs:
Suppliers, Purchase Orders (with reorder suggestions sourced from
stock-health.ts + one-click "Create PO from selected"), Payables (AP aging
buckets + pay-bill dialog). **Note**: per Omar's request, from this phase
onward all pending `.sql` files and Edge Function deploys are being batched
for a single end-of-session handoff instead of one per phase — check the
bottom of this file's status table for the current list of un-run migrations.

#### 18. Sales, AR, Returns & COD reconciliation (FEATURE / ERP-P7)
`cod.ts` pure engine (tested — 4 cases): RTO-rate calc. `sales_schema.sql`:
sales_orders/lines (manual/wholesale channel — draft→confirmed→invoiced;
Shopify orders remain the automatic channel and don't go through this),
customer_invoices, invoice_payments, sales_returns, cod_remittances + three
atomic RPCs — `create_customer_invoice` (deducts stock, posts Dr AR-or-COD
Receivable/Cr Sales Revenue AND Dr COGS/Cr Inventory in one transaction),
`pay_customer_invoice` (Dr Cash/Cr AR, prepaid only), `process_sales_return`
(restocks at prior cost — no WAC blend on a return — and reverses revenue,
either as a cash refund or an AR credit note), `record_cod_remittance`
(settles a batch of COD invoices, splits gross into net-cash + courier-fee-
expense, clears COD Receivable). New top-level **Sales** section (Orders,
Invoices w/ AR aging, Returns, COD w/ RTO-rate stat + remittance recording) —
Egypt-specific differentiator given how common COD is here.

#### 19. CRM 2.0 (FEATURE / ERP-P8)
`rfm.ts` pure engine (tested — 10 cases): `classifyRfmSegment` — rule-based
(not quintile-based; customer counts here are too small for quintiles to be
meaningful) thresholds over orders-count + recency-days → Champion / Loyal
Customer / Promising New Customer / At Risk of Churning / Lost Customer / No
Orders Yet; plus `computeWeightedPipelineValue` and `computeStageFunnel` for
deal pipeline math. `crm2_schema.sql`: adds `follow_up_date` to contacts and
`win_loss_reason` to deals, new `tickets`/`ticket_messages` tables, atomic RPC
`merge_contacts` (re-points notes/activities/deals/tasks/tickets from a
duplicate contact onto the primary, unions tags, keeps the greater of
total_spent/orders_count, deletes the duplicate). CustomersTab rewritten:
segment badges + filter chips, overdue follow-up banner, click-to-WhatsApp
(`wa.me/<digits>`) and click-to-call links, duplicate-detection dialog with
one-click merge, bulk row-select + bulk status update. DealsTab rewritten:
weighted pipeline value + stage funnel cards, win/loss reason prompt on
close, expected-close date. New TicketsTab (status/priority, message thread)
and CrmDashboardTab (segment distribution, top-10 customers, repeat-purchase
rate, weighted pipeline, new-contacts-per-month). New **Dashboard** and
**Tickets** sub-tabs added to the CRM section. `crm2_schema.sql` deferred
per the batched-handoff note in #17.
