-- ============================================================================
-- Apex Business Manager — one-time data fix: the app is now EGP-only.
-- New businesses are always created with currency='EGP', but any businesses
-- created before this change may still have an old currency value stored.
-- Run ONCE in the SQL editor to normalize existing rows.
--   https://supabase.com/dashboard/project/gyqqrbchpepvchjgweep/sql/new
-- ============================================================================

update businesses set currency = 'EGP' where currency is distinct from 'EGP';
