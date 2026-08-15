# Apex Business Manager — Product Plan v2: From Record-Keeping to Decision-Making

> **Status: fully delivered.** All 11 phases plus the multi-vertical rework are built,
> tested (254 tests) and shipped. This document is kept as the reasoning behind the
> work — the diagnosis, the reference models, and why each decision was made.
> `PROJECT_GUIDE.md` records the implementation detail.

---

## 0. This is not an e-commerce app

**Correction made mid-build:** the app must serve four business types, not one.
Everything before this was written assuming an online store — stock, couriers, COD,
ad spend — which quietly made the product useless for three quarters of its audience.

| Type | Sells | Notably has | Notably lacks |
|---|---|---|---|
| **E-commerce** | Products online | Stock, COD, couriers, ad spend, Shopify | — |
| **Retail shop** | Products in person | Stock, purchasing | COD, ads, online sync |
| **Wholesale / B2B** | Products on credit terms | Stock, POs, invoicing | COD, ads, online sync |
| **Service / agency** | Projects, retainers, time | Projects, rate cards, billable hours | Stock entirely |

**How it works:** each business picks a type on creation, which resolves to a set of
**capabilities** (`inventory`, `manufacturing`, `purchasing`, `cod`, `adSpend`,
`onlineStore`, `projects`). Those gate the sidebar sections, the dashboard KPIs, and
which signal providers run. Because the app is already per-business, one workspace can
be a shop while the next is an agency. Presets are a starting point, not a cage —
Setup → Workspace overrides any individual flag, and only genuine deviations are
stored so future preset changes still flow through.

**What this changed concretely:** ROAS/MER/CAC/LTV:CAC now only render for ad-spending
businesses; the COD tab and its signals only exist where COD does; the Inventory
section renames itself to *Purchasing* when there's no stock to hold; and service
businesses get a **Projects** section with the revenue model they actually run on —
fixed-price / hourly / retainer work, rate cards carrying both bill *and* cost rates,
billable time, and unbilled-WIP tracking. Project margin counts **all** hours as cost,
billable or not, which is the trap that quietly kills agency profitability.

---

## 1. The core diagnosis

The app has impressive **breadth** — 10 ERP phases shipped, 56 UI components, a real
double-entry general ledger, atomic multi-table RPCs, WAC inventory costing, RFM
segmentation, COD reconciliation. That foundation is genuinely good and none of it
gets thrown away.

What it lacks is **depth**, and that's exactly why it feels basic:

| What it does today | What a useful business system does |
|---|---|
| Shows you a table of invoices | Tells you *which three customers to chase today, and drafts the message* |
| Shows a 13-week cash line | Tells you *you run dry in week 7 unless you delay the Rashad PO* |
| Stores cost rules | Tells you *you're 22% over your marketing envelope with 11 days left in the month* |
| Lists deals in columns | Tells you *4 deals have gone 14+ days with no next step* |
| Computes profit for a period | Tells you *margin fell 6pts because courier fees rose on COD orders* |

**Every module is a CRUD table. None of them make a decision.** The app records what
happened; it never tells Omar what to *do*. That is the entire gap, and it's the
organising idea for everything below.

### The architectural fix: four layers

```
┌─────────────────────────────────────────────────────────────┐
│ 4. GOVERN    Why & how we run this business                  │  ← new
│              (handbook, SOPs, org, policies, decisions)      │
├─────────────────────────────────────────────────────────────┤
│ 3. OPERATE   The weekly rhythm that drives execution         │  ← new
│              (scorecard, quarterly rocks, meetings, issues)  │
├─────────────────────────────────────────────────────────────┤
│ 2. DECIDE    Signals → ranked, owned, actionable work        │  ← new
│              (signal engine + task/workflow layer)           │
├─────────────────────────────────────────────────────────────┤
│ 1. RECORD    Transactions, ledger, stock, contacts           │  ← exists ✅
└─────────────────────────────────────────────────────────────┘
```

Layer 1 is done. **Layer 2 is the highest-leverage thing we can build** — it's what
converts the existing data into usefulness, and layers 3 and 4 depend on it.

---

## 2. Where each requested system stands

| # | System | What was the gap | What shipped |
|---|---|---|---|
| 1 | **CRM** | Segments didn't drive action | RFM segments feed signals; follow-up queue; WhatsApp/call links; tickets |
| 2 | **ERP** | Modules didn't chain | Document numbering, stock reservation, project→invoice, audit trail |
| 3 | **Cash Flow** | Straight line — every week identical | Direct-method 13-week from real dated obligations; trough; driver breakdown |
| 4 | **Overdue invoices** | Just a count | 5-rung dunning ladder with templates, promise-to-pay, disputes, DSO, ageing |
| 5 | **Profit Tracker** | Single-period snapshot | Margin bridge (volume/price/cost/ads), contribution ranking, trend |
| 6 | **Subscription Auditor** | Didn't exist | Renewal calendar, waste detection, keep/cancel decisions, realised savings |
| 7 | **Sales Pipelines** | A board, no analysis | Stage conversion, ageing, win rate, cycle time, loss reasons, stale alerts |
| 8 | **Budget allocation** | Counted only paid bills | Commitments consume budget on approval; envelope allocation; approval gates |
| 9 | **Operation system** | Didn't exist | EOS — Scorecard, quarterly Rocks, Issues/IDS |
| + | **Governance** | Didn't exist | Handbook, accountability chart, policies, registers, decisions, KPIs, compliance |
| + | **Multi-vertical** | Assumed e-commerce | Four business types gating sections, KPIs and signals; Projects module |
| + | **Reports** | Scattered across modules | One section: financial + operational, preview and CSV, capability-aware |

---

## 3. Reference models we're borrowing from

Rather than invent, each system copies a proven pattern:

- **Cash flow** → the **13-week rolling direct-method forecast (TWCF)**. Projects actual
  receipts and disbursements week by week from real scheduled items, not from accounting
  profit. 71% of corporate treasurers run one; ICAEW recommends it as standard practice
  for scale-ups. Each week's close becomes the next week's open, and the window rolls
  forward weekly.
- **Operating system** → **EOS (Entrepreneurial Operating System / "Traction")**:
  Accountability Chart, weekly Scorecard of 5–15 leading numbers, quarterly Rocks (2–4
  priorities), and the Level 10 weekly meeting with its IDS (Identify-Discuss-Solve)
  issues track.
- **Subscription auditor** → SaaS spend-management tools (Zluri, Cledara, CloudEagle):
  renewal calendar with pre-renewal alerts, usage-vs-cost waste detection, and an explicit
  renew/renegotiate/cancel decision per line.
- **ERP document chaining** → **Odoo's** linked-document model: Quote → Sales Order →
  Stock Reservation → Delivery → Invoice, each step traceable to the last.
- **CRM timeline** → **HubSpot's** record view: one reverse-chronological stream per
  customer mixing orders, invoices, tickets, notes, and messages.
- **AR collections** → standard **dunning ladders**: scheduled, escalating reminders with
  promise-to-pay tracking and DSO as the headline metric.

---

## 4. What "Operation system" means here

You flagged this one with a question mark, so to be explicit — this is the layer that
answers *"how does this business run every week?"*, and EOS is the best-proven small
business answer:

- **Scorecard** — 5–15 leading numbers, one row per metric, one column per week, each with
  an owner and a target. Red when missed. Most numbers pull automatically from data we
  already have (revenue, orders, MER, COD RTO rate, stock-outs, overdue AR, cash balance).
- **Rocks** — the 2–4 things that must get done this quarter, each with one owner and a
  done/not-done status. Prevents trying to move everything at once.
- **Level 10 meeting** — a fixed weekly agenda: check-in → scorecard review → rock review →
  headlines → to-do review → IDS. The app runs the agenda with a timer, and everything
  raised becomes a tracked issue or to-do.
- **Issues list (IDS)** — the running list of problems, prioritised and solved in the
  meeting, not in the hallway.

---

## 5. What the Governance section is

Your framing was exactly right: *"so if anyone new manages the business they know what it
is."* This is the **company operating manual** — the thing that makes the business
transferable rather than living in your head.

Proposed structure (9 blocks):

1. **Business profile** — legal entity, tax IDs, registration numbers, fiscal year, key dates.
2. **Accountability chart** — who owns which seat and function (ties into EOS + `employees`).
3. **SOPs / playbooks** — versioned step-by-step procedures ("how to process a COD
   remittance", "how to onboard a supplier"), each with an owner and a last-reviewed date.
4. **Policies & limits** — approval thresholds, refund policy, discount limits, credit terms,
   who can sign what. These become *enforceable* — the approval gates in §6 read from here.
5. **Vendor & partner register** — couriers, suppliers, agencies, accountants: contacts,
   terms, contract dates, renewal dates (feeds the Subscription Auditor).
6. **Systems & access register** — which tools the business runs on, who owns each, where it
   lives, and who has access. **Pointers only — no passwords, no secrets stored.** Credential
   storage belongs in a real password manager; this register just records *that* a
   credential exists, who holds it, and where. This is a deliberate safety boundary.
7. **Decision log** — dated architectural/business decisions with rationale ("why we moved to
   COD-only with courier X"), so future managers understand the *why*, not just the *what*.
8. **KPI dictionary** — the precise definition of every metric the app shows (what counts as
   an "order", how MER is computed, what net revenue excludes). Prevents two people reading
   the same number differently.
9. **Compliance calendar** — recurring obligations (tax filings, licence renewals, insurance)
   with lead-time alerts, feeding the same signal engine as everything else.

---

## 6. The build plan

Nine phases, each independently shippable, each following existing conventions: pure
tested logic in `src/finance/*.ts`, all DB access via typed `*Api` objects in
`src/services/db.ts`, multi-table writes through atomic Postgres RPCs, EGP-only, no-login.

### Phase 0 — Navigation fixes + IA restructure *(small, do first)*
- ✅ **Already fixed this session:** the sidebar went dead on Settings / Manage-businesses
  (it required a business `:id` in the URL); it now falls back to your last-used business
  so every section link stays live.
- Restructure the sidebar to absorb the new layers without becoming a wall of 40 links:
  `Command · Finance · Sales · Inventory · CRM · People · Operate · Govern · Setup`
- Rename Overview → **Command** (it becomes the decision surface, §Phase 2).
- Files: `src/config/businessSections.ts`, `SidebarNav.tsx`, `App.tsx`.

### Phase 1 — The Signal Engine *(the keystone — everything else plugs into it)*
A single, extensible rules engine that scans every module and emits ranked, typed,
**actionable** signals.

- `src/finance/signals.ts` — pure + tested. Input: aggregated module state. Output:
  `Signal[]` with `{ id, severity, domain, title, why, impactEgp, suggestedAction, entityRef }`.
- Ranked by **money at stake**, not just severity — a 40,000 EGP overdue invoice outranks
  three low-stock SKUs.
- Replaces the current `alerts.ts` (which only counts things) — that becomes one signal
  provider among many.
- Schema: `signals` table (materialised per scan, so they can be snoozed/dismissed/assigned
  with an audit trail).
- Every later phase registers new signal providers rather than building its own alert UI.

### Phase 2 — Action layer + Command dashboard
- `tasks` gets promoted from a CRM sub-tab into a first-class **work item** model: owner,
  due date, source signal, entity link, status.
- Any signal converts to a task in one click ("Chase invoice #1042" → assigned, due Thursday).
- **Command dashboard** replaces Overview: *"What needs deciding today"* — ranked signals,
  my open tasks, cash runway, the week's scorecard row. This becomes the app's front door.

### Phase 3 — Cash Flow, properly *(highest financial value)*
Replace the straight-line `forecast.ts` with a real direct-method 13-week model:
- **Inflows:** open customer invoices by due date, COD remittances by courier lag, forecast
  sales from trailing velocity.
- **Outflows:** supplier bills by due date, PO commitments, payroll runs, recurring cost
  rules by their real cadence, compliance calendar payments.
- Weekly rolling, each week's close = next week's open.
- **Runway callout**, scenario toggles ("what if the Rashad PO slips 2 weeks?"), and
  variance tracking (forecast vs actual) so the model earns trust.
- Emits signals: cash dips below floor in week N.

### Phase 4 — Receivables & Dunning
- Dunning ladder: scheduled reminders at configurable ages (e.g. −3, +1, +7, +14, +30 days).
- WhatsApp/email message templates in EN/AR with merge fields (Egypt-practical — WhatsApp
  links already exist in the CRM).
- Promise-to-pay tracking, dispute flagging, and **DSO** as the headline metric.
- Escalation states feed the signal engine; every touch lands on the customer timeline.

### Phase 5 — Profit Tracker 2.0
- Trend over time, not a snapshot: monthly margin bridge showing *why* profit moved
  (volume / price / COGS / ad spend / fees).
- Attribution by product, channel, courier, and customer cohort.
- Contribution-margin ranking that flags loss-making SKUs as signals.
- Plan-vs-actual variance once Phase 7 budgets land.

### Phase 6 — Sales Pipelines 2.0
- Multiple named pipelines with custom stages (retail / wholesale / B2B).
- **Next-step enforcement** — a deal with no scheduled next action is a signal.
- Stage aging and conversion analytics (where deals die, how long each stage takes).
- Weighted pipeline value feeds the cash-flow forecast as probable inflow.

### Phase 7 — Budget Allocation
- Top-down **envelope planning**: set a period budget, allocate down to categories/products.
- **Commitment accounting** — an approved PO consumes budget *before* the bill arrives, so
  you see committed vs spent vs remaining (this is what makes budgets real).
- Rolling reforecast, variance drill-down to the transaction.
- **Approval gate**: spend above the policy limit (from Governance §5.4) requires explicit
  approval and is logged.

### Phase 8 — Subscription Auditor
- Recurring-spend register auto-detected from `fixed_monthly` cost rules + repeating supplier
  bills, plus manual entries.
- **Renewal calendar** with configurable pre-renewal alerts — the single highest-value
  feature, since it prevents silent auto-renewals.
- Waste scoring: cost per active user/seat, a "last confirmed used" attestation, and
  flags for duplicate-purpose tools.
- An explicit **renew / renegotiate / cancel** decision per line, with the saving recorded.

### Phase 9 — Operate (EOS) + Govern
- **Operate:** Scorecard (auto-pulling numbers we already compute), quarterly Rocks, L10
  meeting runner with agenda + timer, Issues list with IDS workflow.
- **Govern:** the 9 blocks from §5. Rich-text SOPs with ownership and review dates,
  accountability chart, policy limits (consumed by Phase 7's approval gate), decision log,
  KPI dictionary, compliance calendar (feeding signals), systems register (pointers only).

### Phase 10 — ERP chaining *(depth on what exists)*
- Document numbering scheme across all document types.
- **Stock reservation** — a confirmed sales order reserves inventory so it can't be double-sold.
- Auto-draft POs from reorder signals (the math already exists in `reorder.ts`).
- Approval states on POs and payments, tied to Governance policy limits.
- Full document traceability chain, Odoo-style.

---

## 7. Sequencing rationale

```
Phase 0 (nav)  →  Phase 1 (signals)  →  Phase 2 (action + Command)
                          ↓
        ┌─────────────────┼─────────────────┬──────────────┐
        ↓                 ↓                 ↓              ↓
   Phase 3 cash      Phase 4 AR       Phase 5 profit  Phase 6 pipeline
        ↓                 ↓                 ↓              ↓
        └────────→  Phase 7 budgets  ←──────┘              │
                          ↓                                │
                   Phase 8 subscriptions                   │
                          ↓                                │
                   Phase 9 operate + govern  ←─────────────┘
                          ↓
                   Phase 10 ERP chaining
```

Phases 1–2 are the keystone: they're what makes every later phase land as *usefulness*
rather than another table. Phases 3–4 carry the most immediate financial value (cash
visibility and getting paid). Phase 9 depends on 1–8 existing so the Scorecard has real
numbers to pull.

**Recommended first slice if you want value fastest:** Phases 0 → 1 → 2 → 3. That alone
converts the app from a ledger into something that tells you what to do each morning.

---

## 8. Verification standard (per phase)

Non-negotiable, matching how the ERP phases were built:
- Pure business logic in `src/finance/*.ts` with vitest coverage including edge cases
  (currently 78 tests — every phase adds to this).
- `npm test` green, `npm run build` and `npm run build:electron` clean.
- Schema as an idempotent numbered migration in `supabase/migrations/`, applied to the
  local Docker Supabase stack first and verified there before it ever touches hosted.
- Seed data + a manual click-through checklist per phase.
- `PROJECT_GUIDE.md` session record updated.
