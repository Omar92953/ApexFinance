-- ============================================================================
-- Apex Business Manager — Phase 3: full Shopify auto-sync (products + stock
-- auto-decrement on sale). Run ONCE in the SQL editor, AFTER deploying the
-- sync-shopify-products Edge Function.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
--
-- What this does:
--  1. Adds a stable Shopify line-item id to order_line_items so repeated syncs
--     UPDATE the same row instead of creating duplicates.
--  2. Widens inventory_movements.reference_id from uuid to text so it can
--     store a Shopify line-item id (not just internal uuids), and adds a
--     dedupe index so a sale is only ever recorded as one stock movement.
-- ============================================================================

alter table order_line_items add column if not exists shopify_line_item_id text;
create unique index if not exists idx_oli_shopify_line on order_line_items(business_id, shopify_line_item_id);

alter table inventory_movements alter column reference_id type text using reference_id::text;
create unique index if not exists idx_invmov_dedupe on inventory_movements(business_id, movement_type, reference_type, reference_id);
