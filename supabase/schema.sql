-- WeSplit schema
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Safe to re-run: everything is guarded.

-- ---------------------------------------------------------------------------
-- Who is allowed in
-- ---------------------------------------------------------------------------
-- Magic-link sign-up is open by default, so the gate is an allowlist. A new
-- auth user only gets a profile if their email is listed here, and every
-- policy below requires a profile. Anyone else can sign in and see nothing.

create table if not exists allowed_emails (
  email text primary key,
  display_name text not null,
  initials text not null,
  color text not null default '#10896B'
);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  display_name text not null,
  initials text not null,
  color text not null default '#10896B',
  created_at timestamptz not null default now()
);

-- Create the profile automatically on first sign-in, but only for allowlisted
-- addresses. security definer because it writes across schemas.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed allowed_emails%rowtype;
begin
  select * into allowed from allowed_emails where lower(email) = lower(new.email);
  if not found then
    return new; -- signed up, but gets no profile and therefore no access
  end if;

  insert into profiles (id, email, display_name, initials, color)
  values (new.id, lower(new.email), allowed.display_name, allowed.initials, allowed.color)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- The single predicate every policy leans on.
create or replace function is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default 'receipt',
  sort_order int not null default 100
);

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
-- Money is integer cents everywhere. No numeric, no float, ever.

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (length(trim(description)) > 0),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'CAD',
  paid_by uuid not null references profiles(id),
  category_id uuid references categories(id) on delete set null,
  spent_on date not null default current_date,
  note text,
  split_mode text not null default 'equal'
    check (split_mode in ('equal', 'exact', 'percent', 'shares', 'full')),
  -- Recurrence lives on the series root; generated copies point back at it.
  recurrence text check (recurrence in ('weekly', 'monthly', 'yearly')),
  recurrence_parent uuid references expenses(id) on delete set null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists expenses_spent_on_idx on expenses (spent_on desc) where deleted_at is null;
create index if not exists expenses_paid_by_idx on expenses (paid_by) where deleted_at is null;
create index if not exists expenses_recurrence_idx on expenses (recurrence) where recurrence is not null and deleted_at is null;

-- One row per person per expense. This table is what makes every split mode
-- work: the mode is only a way of arriving at these numbers.
create table if not exists expense_shares (
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  share_cents bigint not null check (share_cents >= 0),
  primary key (expense_id, user_id)
);

create index if not exists expense_shares_user_idx on expense_shares (user_id);

-- Shares must add up to the expense total, or the data is lying about who
-- owes what. Deferred so the app can insert the expense and its shares in one
-- transaction; the check runs at commit.
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

drop trigger if exists shares_balance_on_shares on expense_shares;
create constraint trigger shares_balance_on_shares
  after insert or update or delete on expense_shares
  deferrable initially deferred
  for each row execute function check_shares_balance();

drop trigger if exists shares_balance_on_expenses on expenses;
create constraint trigger shares_balance_on_expenses
  after insert or update on expenses
  deferrable initially deferred
  for each row execute function check_shares_balance();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists expenses_touch on expenses;
create trigger expenses_touch before update on expenses
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Settlements
-- ---------------------------------------------------------------------------
-- Settling up inserts a row here and touches nothing else. That is the whole
-- reason expense history survives every settle-up.

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references profiles(id),
  to_user uuid not null references profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'CAD',
  method text,
  settled_on date not null default current_date,
  note text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint settlement_two_parties check (from_user <> to_user)
);

create index if not exists settlements_date_idx on settlements (settled_on desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Balances: derived, never stored
-- ---------------------------------------------------------------------------
-- A stored balance column drifts away from the expenses behind it and there
-- is no way to tell which one is right. So it is computed, every time.
--
-- net_cents > 0 means the other person owes you that much.

create or replace view user_balances
with (security_invoker = on) as
select
  p.id as user_id,
  p.display_name,
  coalesce(paid.total, 0)      as paid_cents,
  coalesce(owed.total, 0)      as owed_cents,
  coalesce(sent.total, 0)      as settled_out_cents,
  coalesce(recv.total, 0)      as settled_in_cents,
  coalesce(paid.total, 0) - coalesce(owed.total, 0)
    + coalesce(sent.total, 0) - coalesce(recv.total, 0) as net_cents
from profiles p
left join (
  select paid_by as uid, sum(amount_cents) as total
  from expenses where deleted_at is null group by paid_by
) paid on paid.uid = p.id
left join (
  select s.user_id as uid, sum(s.share_cents) as total
  from expense_shares s
  join expenses e on e.id = s.expense_id and e.deleted_at is null
  group by s.user_id
) owed on owed.uid = p.id
left join (
  select from_user as uid, sum(amount_cents) as total
  from settlements where deleted_at is null group by from_user
) sent on sent.uid = p.id
left join (
  select to_user as uid, sum(amount_cents) as total
  from settlements where deleted_at is null group by to_user
) recv on recv.uid = p.id;

-- Monthly spend by category, for the summary screen.
create or replace view monthly_category_totals
with (security_invoker = on) as
select
  date_trunc('month', e.spent_on)::date as month,
  coalesce(c.name, 'Uncategorized')     as category,
  sum(e.amount_cents)                   as total_cents
from expenses e
left join categories c on c.id = e.category_id
where e.deleted_at is null
group by 1, 2;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The anon key in the browser is public and that is fine. This is the gate.

alter table profiles       enable row level security;
alter table categories     enable row level security;
alter table expenses       enable row level security;
alter table expense_shares enable row level security;
alter table settlements    enable row level security;
alter table allowed_emails enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'categories', 'expenses', 'expense_shares', 'settlements']
  loop
    execute format('drop policy if exists members_read on %I', t);
    execute format('drop policy if exists members_write on %I', t);
    execute format(
      'create policy members_read on %I for select to authenticated using (is_member())', t);
    execute format(
      'create policy members_write on %I for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
end $$;

-- allowed_emails is deliberately left with RLS on and no policy: nothing in
-- the browser can read or change the allowlist. Edit it in the SQL editor.

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- This is what makes both phones agree without a refresh.

do $$
begin
  execute 'alter publication supabase_realtime add table expenses';
exception when duplicate_object then null;
end $$;
do $$
begin
  execute 'alter publication supabase_realtime add table expense_shares';
exception when duplicate_object then null;
end $$;
do $$
begin
  execute 'alter publication supabase_realtime add table settlements';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Recurring expenses
-- ---------------------------------------------------------------------------
-- Rent, internet, pet insurance. A series root carries the recurrence rule;
-- every generated copy points back at it and carries the same shares.

create or replace function materialize_recurring()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  root      expenses%rowtype;
  last_on   date;
  next_on   date;
  step      interval;
  new_id    uuid;
  made      int := 0;
begin
  for root in
    select * from expenses
    where recurrence is not null and recurrence_parent is null and deleted_at is null
  loop
    step := case root.recurrence
              when 'weekly'  then interval '1 week'
              when 'monthly' then interval '1 month'
              when 'yearly'  then interval '1 year'
            end;

    select max(spent_on) into last_on
      from expenses
      where id = root.id or recurrence_parent = root.id;

    next_on := (last_on + step)::date;

    while next_on <= current_date loop
      insert into expenses (
        description, amount_cents, currency, paid_by, category_id, spent_on,
        note, split_mode, recurrence_parent, created_by
      )
      values (
        root.description, root.amount_cents, root.currency, root.paid_by,
        root.category_id, next_on, root.note, root.split_mode, root.id, root.created_by
      )
      returning id into new_id;

      insert into expense_shares (expense_id, user_id, share_cents)
      select new_id, user_id, share_cents from expense_shares where expense_id = root.id;

      made := made + 1;
      next_on := (next_on + step)::date;
    end loop;
  end loop;

  return made;
end;
$$;

-- Schedule it. Requires the pg_cron extension (Database -> Extensions).
-- Runs at 06:00 UTC daily; the function itself is a no-op when nothing is due.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('wesplit-recurring')
      where exists (select 1 from cron.job where jobname = 'wesplit-recurring');
    perform cron.schedule('wesplit-recurring', '0 6 * * *', 'select materialize_recurring()');
  else
    raise notice 'pg_cron not installed; enable it and re-run to schedule recurring expenses';
  end if;
end $$;
