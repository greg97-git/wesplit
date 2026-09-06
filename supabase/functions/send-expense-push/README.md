# Push notifications: one-time setup

Code is done; these are Supabase/dashboard steps I can't run myself (no CLI
session, no project access). About 10 minutes, all in the Supabase dashboard
plus one CLI deploy.

## 1. VAPID keys

Already generated (P-256 keypair), so there's nothing to run for this step:

```
VAPID_PUBLIC_KEY  = BF75wu5iX0ytdgBMkxfT97o4RA8tFagcIP9t_r_BBXYedE1THkvEnpKAGRDzpu6M0eSwXXzkUFqC0h_Hgnkq4DQ
VAPID_PRIVATE_KEY = 6bnfugDqVL0JOaXnsTkS8LrPDtqaub8SsJ8eXDZwKRs
```

The public half is already baked into `src/push.js`. Keep the private half
secret -- it's what lets the Edge Function sign messages as this app.

## 2. Run the migration

`supabase/migrations/004-push-subscriptions.sql` in the SQL editor (or
`supabase db push` if you use the CLI).

## 3. Deploy the Edge Function

```
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy send-expense-push --no-verify-jwt
```

`--no-verify-jwt` because the caller is a Database Webhook, not a logged-in
user.

## 4. Set the function's secrets

```
supabase secrets set VAPID_PUBLIC_KEY=BF75wu5iX0ytdgBMkxfT97o4RA8tFagcIP9t_r_BBXYedE1THkvEnpKAGRDzpu6M0eSwXXzkUFqC0h_Hgnkq4DQ
supabase secrets set VAPID_PRIVATE_KEY=6bnfugDqVL0JOaXnsTkS8LrPDtqaub8SsJ8eXDZwKRs
supabase secrets set VAPID_SUBJECT=mailto:you@yourdomain.com
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically --
no need to set those.)

## 5. Wire up the trigger

Dashboard -> Database -> Webhooks -> Create a new webhook:
- Table: `expenses`
- Events: `Insert` only (an edit shouldn't re-notify)
- Type: Supabase Edge Function
- Function: `send-expense-push`

## 6. On the phone

Push only works on an installed PWA (Settings -> Share -> Add to Home
Screen), and only on iOS 16.4+. From the app's Account tab, tap "Notify me
when an expense is added" and accept the permission prompt.

## Why it needed this much

Static hosting + a client talking straight to Supabase has no server that's
always running to push through Apple's/Google's/Mozilla's push services, so
that piece has to live somewhere -- here, a Supabase Edge Function invoked by
a Database Webhook. Everything else (the subscription table, the service
worker's `push`/`notificationclick` handlers, the Account-tab toggle) is
already in place and needs nothing further.
