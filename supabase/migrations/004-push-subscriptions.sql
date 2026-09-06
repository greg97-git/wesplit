-- Web Push subscriptions, one row per device that's opted in. The actual
-- send happens in the send-expense-push Edge Function, invoked by a Database
-- Webhook on expenses insert (Dashboard -> Database -> Webhooks) -- see
-- supabase/functions/send-expense-push/README.md for the one-time setup.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists own_subscriptions on push_subscriptions;
create policy own_subscriptions on push_subscriptions for all
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
