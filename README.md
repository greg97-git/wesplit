# WeSplit

Shared expenses for two people. A replacement for Splitwise's free tier, without the daily expense cap or the ads.

Runs as an installed PWA on both phones, syncing through Supabase in real time. No server to run, no app store, no cost.

**Setup instructions: [SETUP.md](SETUP.md).**

## Stack

| Piece | Job |
|---|---|
| React + Vite | UI and build |
| `vite-plugin-pwa` | manifest and service worker, so it installs to the home screen |
| Supabase Postgres | the database |
| Supabase Auth | magic-link sign-in, one account each |
| Supabase Realtime | both phones see the same thing without refreshing |
| GitHub Actions + Pages | build and hosting |

## How it fits together

```
phone (installed PWA)
  ├── loads the static bundle from GitHub Pages (cached by the service worker)
  ├── reads and writes rows via Supabase REST
  └── holds a websocket to Supabase Realtime for live updates
```

There is no backend of our own. The browser talks straight to Postgres through PostgREST, and Row Level Security decides what it's allowed to see.

## Three decisions

**Money is integer cents.** `amount_cents = 12840` is $128.40. Floats can't represent 0.10 exactly and the error compounds across hundreds of rows, so nothing decimal ever reaches the database. `src/split.js` converts at the edges and nowhere else.

**Balances are derived, never stored.** The `user_balances` view computes them from expenses, shares and settlements on every read. A stored balance column drifts from the rows behind it and there's no way to tell which one is right.

**Settling up never touches expenses.** It inserts a row in `settlements` that offsets the balance. That's why full history survives every settle-up.

## Split modes

Equal, exact amounts, percentages, shares, and one-person-owes-it-all. All five reduce to the same thing: a per-person share in cents that sums *exactly* to the total.

Remainders are the interesting part. $10.01 split evenly between two people doesn't divide, and rounding each share independently either loses a cent or invents one. Instead every share is floored and the leftover cents are handed out by largest fractional remainder, ties broken on a stable order — so both phones compute the same allocation.

A deferred constraint trigger in Postgres rejects any expense whose shares don't add up, so even a bug in the UI can't write bad data.

## Layout

```
src/
  split.js     pure allocation and money formatting — all the logic worth testing
  data.js      Supabase queries, realtime subscription, writes
  supabase.js  client
  App.jsx      every screen
  icons.jsx    inline SVG set
supabase/
  schema.sql   tables, views, RLS, triggers, recurring job
  seed.sql     the two allowed emails and the category list
test/
  split.test.js
```

Navigation is plain React state rather than a router. GitHub Pages can't do server-side routing, so this sidesteps the problem instead of working around it with hash URLs.

## Commands

```bash
npm run dev     # local server, hot reload
npm test        # split-math tests
npm run build   # production build
```
