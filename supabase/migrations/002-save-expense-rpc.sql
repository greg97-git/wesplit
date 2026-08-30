-- Fix: saving an expense failed with
--   Shares for expense ... add up to 0 cents but the expense is 5000 cents
--
-- The share-balance trigger is deferred to the end of the transaction, which
-- assumed the expense and its shares were written together. They were not:
-- PostgREST has no client-side transactions, so the app's two calls were two
-- separate transactions, and the first one committed with no shares attached.
--
-- The fix is to do both writes in a single database function, so there is one
-- transaction and the trigger sees the finished picture.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

create or replace function save_expense(
  p_id           uuid,      -- null to create, an id to update
  p_description  text,
  p_amount_cents bigint,
  p_paid_by      uuid,
  p_category_id  uuid,
  p_spent_on     date,
  p_note         text,
  p_split_mode   text,
  p_recurrence   text,
  p_shares       jsonb      -- {"<user id>": <cents>, ...}
) returns uuid
language plpgsql
as $$
declare
  eid uuid;
begin
  if not is_member() then
    raise exception 'Not authorized';
  end if;

  if p_id is null then
    insert into expenses (description, amount_cents, paid_by, category_id,
                          spent_on, note, split_mode, recurrence, created_by)
    values (p_description, p_amount_cents, p_paid_by, p_category_id,
            p_spent_on, p_note, p_split_mode, p_recurrence, auth.uid())
    returning id into eid;
  else
    update expenses
       set description  = p_description,
           amount_cents = p_amount_cents,
           paid_by      = p_paid_by,
           category_id  = p_category_id,
           spent_on     = p_spent_on,
           note         = p_note,
           split_mode   = p_split_mode,
           recurrence   = p_recurrence
     where id = p_id and deleted_at is null
     returning id into eid;

    if eid is null then
      raise exception 'Expense % not found', p_id;
    end if;

    delete from expense_shares where expense_id = eid;
  end if;

  insert into expense_shares (expense_id, user_id, share_cents)
  select eid, key::uuid, value::bigint from jsonb_each_text(p_shares);

  return eid;
end;
$$;

revoke all on function save_expense(uuid, text, bigint, uuid, uuid, date, text, text, text, jsonb) from public;
grant execute on function save_expense(uuid, text, bigint, uuid, uuid, date, text, text, text, jsonb) to authenticated;
