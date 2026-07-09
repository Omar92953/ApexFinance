-- ============================================================================
-- Apex Business Manager — widen product_cost_items so it can hold a per-product
-- cost breakdown (materials / labor / packaging / other) that rolls up into the
-- product variant's cost_per_item. Run ONCE in the SQL editor.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

alter table product_cost_items drop constraint if exists product_cost_items_category_check;
alter table product_cost_items drop constraint if exists product_cost_items_basis_check;

-- product_id on this table is text (legacy) — we store the variant's uuid as text.
create index if not exists idx_pci_product_id on product_cost_items(product_id);
