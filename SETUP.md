# WeSplit setup

Four stages. Do them in order. Stage 1 gets it running on your Mac; stages 2 to 4 get it onto both phones.

---

## 1. Supabase

**Create the project.** Go to supabase.com, sign in with GitHub, New project. Name it `wesplit`, pick the region closest to you (`East US (North Virginia)` is fine from Montreal), and let it generate a database password. Save that password somewhere; you won't need it day to day but you can't recover it. The project takes about two minutes to provision.

DB Pw: U5aXg8BQU45YOrra

**Run the schema.** Left sidebar, SQL Editor, New query. Paste all of `supabase/schema.sql` and hit Run. It should say Success with no rows returned. If it complains about `pg_cron`, that's the notice at the very bottom and it's harmless for now — see step 4 below.

**Seed it.** Open `supabase/seed.sql`, change `CHANGE-ME@example.com` to Sofia's real email, then paste the whole file into a new SQL query and run it. This allowlist is the gate: anyone can request a magic link, but only these two addresses ever get a profile, and without a profile every policy returns nothing.

**Get your keys.** Project Settings, API. Copy the Project URL and the `anon` `public` key. Do not copy the `service_role` key — it bypasses Row Level Security and must never leave that page.

URL: https://iulxupupcmmwfzbeddnp.supabase.co
Public Key: sb_publishable_GcGLqAtkLw9ci-ReIqbu0Q_DphngsNO

**Turn off unwanted signups (optional but sensible).** Authentication, Providers, Email: leave Email enabled, turn off "Confirm email" only if you want fewer clicks. Magic links work either way.

---

## 2. Run it locally

```bash
cd ~/Documents/shared-expenses
cp .env.example .env.local
open -e .env.local          # paste in the two values, save, close
npm install
npm run dev
```

Open http://localhost:5174/wesplit/ and enter your email. The magic link arrives in a few seconds; open it in the same browser. You should land on an empty expense list with your name in the header.

Sofia won't appear as a person until she signs in for the first time, because that's when her profile row gets created. Until then the Add expense button stays disabled. Have her open the local URL on your machine once, or just wait until stage 3 and do it from her phone.

**If the page is blank:** it's almost always `.env.local`. Check it exists (`ls -la`), check both values are filled in, and restart `npm run dev` — Vite only reads env vars at startup.

---

## 3. GitHub and deployment

**Create the repo.** On github.com, New repository, name it `wesplit`, **Public** (GitHub Pages needs public on the free plan), no README or .gitignore since you already have files.

**Push.**

```bash
cd ~/Documents/shared-expenses
git init
git add .
git commit -m "WeSplit: initial commit"
git branch -M main
git remote add origin https://github.com/greg97-git/wesplit.git
git push -u origin main
```

**Add the secrets.** Repo Settings, Secrets and variables, Actions, New repository secret. Add two:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon key |

These get injected at build time. The anon key ends up in the compiled JavaScript, which is fine and by design — RLS is the actual gate.

**Turn on Pages.** Repo Settings, Pages, Source: **GitHub Actions**. Not "Deploy from a branch".

**Deploy.** Push anything, or Actions tab, Deploy to GitHub Pages, Run workflow. About 60 seconds later it's live at:

```
https://greg97-git.github.io/wesplit/
```

If you name the repo something other than `wesplit`, change `base` in `vite.config.js` and both `scope` and `start_url` in the PWA manifest block to match, or you'll get a blank page.

**Add Supabase's redirect URL.** Back in Supabase: Authentication, URL Configuration. Set Site URL to `https://greg97-git.github.io/wesplit/` and add both that URL and `http://localhost:5173/wesplit/` to Redirect URLs. Magic links won't come back to the app without this.

---

## 4. Install on both phones

On each iPhone, open the Pages URL in **Safari** (not Chrome — only Safari can install to the home screen on iOS), tap Share, then Add to Home Screen. It opens full-screen with no browser chrome.

Sign in on each phone with the matching email. Sofia's profile row is created the first time she signs in.

**Recurring expenses.** Supabase Dashboard, Database, Extensions, search `pg_cron`, enable it. Then re-run the last block of `schema.sql` (the `do $$ ... cron.schedule ... $$` at the bottom) to register the daily job. Without this, expenses marked as repeating simply never generate copies; nothing else breaks.

---

## Things worth knowing

**The anon key is public.** It identifies the project, it doesn't grant access. Every table has RLS on with policies that require a row in `profiles`, and profiles are only created for allowlisted emails. Someone reading the key out of your JavaScript gets nothing.

**Free Supabase projects pause after seven days of no activity.** Daily use means you'll never see it. If the app ever seems dead, check the dashboard — one click resumes it.

**The service worker caches the app shell, not your data.** Expenses always come from the network. If you ship a change and the phone shows the old version, close the app fully and reopen; `registerType: autoUpdate` picks it up on next launch.

**Deleting is soft.** `deleted_at` gets set, the row stays. If either of you deletes something by accident, it's recoverable in the SQL editor:

```sql
update expenses set deleted_at = null where id = '...';
```

**Everything is integer cents.** If you ever query the database by hand, `amount_cents = 12840` means $128.40. Never store a decimal in these columns.

---

## Commands

```bash
npm run dev      # local server with hot reload
npm test         # split-math tests, 19 of them
npm run build    # production build, same as CI runs
git add . && git commit -m "what changed" && git push   # deploys in ~60s
```
