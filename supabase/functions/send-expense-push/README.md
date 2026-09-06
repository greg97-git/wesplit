# Push notifications: one-time setup

Code is done; these are Supabase/dashboard steps I can't run myself (no CLI
session, no project access). About 10 minutes, all in the Supabase dashboard
plus one CLI deploy.

## 1. VAPID keys

The public half is already baked into `src/push.js`
(`BLqczVZkgtYqVCWSFzOzVjXLm64HUFdVASKo0OdlpCD2x5CQFceoQxmDbyNF2D_lJu5BCLTn3SbwdpZVXaGG5S8`)
-- that one is meant to be public, the same way the Supabase anon key is.

The matching private key was generated for you in chat, not written to any
file in this repo (this is a public repo -- anything committed here is
world-readable, so a private key has no business living in it). Grab it from
that message and paste it directly into the `supabase secrets set` command
below. If you've lost it, just generate a new pair and update the public key
above and in `src/push.js` to match:

```
node -e "
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ type: 'spki', format: 'der' });
const pubPoint = pub.subarray(pub.length - 65);
const jwkPriv = privateKey.export({ format: 'jwk' });
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+\$/,'');
console.log('PUBLIC:', b64url(pubPoint));
console.log('PRIVATE:', jwkPriv.d);
"
```

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
supabase secrets set VAPID_PUBLIC_KEY=BLqczVZkgtYqVCWSFzOzVjXLm64HUFdVASKo0OdlpCD2x5CQFceoQxmDbyNF2D_lJu5BCLTn3SbwdpZVXaGG5S8
supabase secrets set VAPID_PRIVATE_KEY=<paste the private key here -- never commit it>
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
