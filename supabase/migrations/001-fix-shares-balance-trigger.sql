-- Fix: saving any expense failed with
--   record "new" has no field "expense_id"
--
-- The original function resolved the expense id with a CASE inside a
-- COALESCE. PL/pgSQL resolves record fields at runtime regardless of which
-- CASE branch would be taken, so on the expenses trigger it still tried to
-- read new.expense_id -- a field that only exists on expense_shares.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

create or replace function check_shares_balance()
returns trigger
language plpgsql
as $$
declare
  target uuid;
  total bigint;
  allocated bigint;
  is_deleted boolean;
begin
  -- Resolve the expense id without ever referencing a field that does not
  -- exist on this table's record, or a record that is null for this
  -- operation. PL/pgSQL resolves record fields at runtime, so a CASE that
  -- merely guards the reference is not enough -- the branch has to not run.
  if tg_table_name = 'expenses' then
    target := new.id;
  elsif tg_op = 'DELETE' then
    target := old.expense_id;
  else
    target := new.expense_id;
  end if;

  select amount_cents, deleted_at is not null into total, is_deleted
    from expenses where id = target;

  if not found or is_deleted then
    return null; -- expense is gone or soft-deleted; nothing to balance
  end if;

  select coalesce(sum(share_cents), 0) into allocated
    from expense_shares where expense_id = target;

  if allocated <> total then
    raise exception
      'Shares for expense % add up to % cents but the expense is % cents',
      target, allocated, total;
  end if;

  return null;
end;
$$;
