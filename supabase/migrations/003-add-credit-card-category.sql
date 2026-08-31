-- Add a "Credit Card" expense category.
--
-- The icon column is just a lookup key into the categoryGlyph map in
-- src/icons.jsx, not an image — 'card' maps to a credit-card emoji there.
-- Anything without a matching app-side entry silently falls back to the
-- receipt glyph, so this migration only takes effect together with that
-- code change.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

insert into categories (name, icon, sort_order) values
  ('Credit Card', 'card', 70)
on conflict (name) do nothing;
