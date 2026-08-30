# WeSplit setup

Four stages. Do them in order. Stage 1 gets it running on your Mac; stages 2 to 4 get it onto both phones.

---

## 1. Supabase

**Create the project.** Go to supabase.com, sign in with GitHub, New project. Name it `wesplit`, pick the region closest to you (`East US (North Virginia)` is fine from Montreal), and let it generate a database password. Save that password in your password manager; you won't need it day to day but you can't recover it. The project takes about two minutes to provision.

**Run the schema.** Left sidebar, SQL Editor, New query. Paste all of `supabase/schema.sql` and hit Run. It should say Success with no rows returned. If it complains about `pg_cron`, that's the notice at the very bottom and it's harmless for now — see step 4 below.

**Seed it.** Open `supabase/seed.sql`, change `CHANGE-ME@example.com` to Sofia's real email, then paste the whole file into a new SQL query and run it. This allowlist is the gate: anyone can request a magic link, but only these two addresses ever get a profile, and without a profile every policy returns nothing.

**Get your keys.** Project Settings, API Keys, and Project Settings, Data API for the URL. You need two values:

- **Project URL** — the bare `https://<project-id>.supabase.co`. No path on the end. If you copy something ending in `/rest/v1/`, trim that off; supabase-js appends it itself and leaving it on produces 404s.
- **Publishable key** — starts with `sb_publishable_`. This is the new name for what used to be called the `anon` key: same low privileges, same behaviour under RLS. Our env var is still called `VITE_SUPABASE_ANON_KEY`; that is just our label.

Never copy the **secret** key (`sb_secret_`, formerly `service_role`). It bypasses Row Level Security entirely and must never leave that page.

Your own values are in `NOTES.local.md`, which is gitignored.

**Turn off unwanted signups (optional but sensible).** Authentication, Providers, Email: leave Email enabled, turn off "Confirm email" only if you want fewer clicks. Magic links work either way.

**Set up email delivery before you test.** Supabase's built-in email service sends 2 messages per hour and is not meant for production. You will hit that limit within minutes of testing sign-in, and the emails often land in spam because they come from a shared Supabase sender.

Point it at your own Gmail instead. Ten minutes, no domain needed, and roughly 500 messages a day.

1. Google Account, Security, 2-Step Verification (it has to be on), App passwords. Create one named `WeSplit Supabase` and copy the 16 characters into your password manager. Google only shows it once, so generate a fresh one rather than hunting for an old one.
2. Supabase: Authentication, Emails, SMTP Settings. Enable custom SMTP and fill in:

   | Field | Value |
   |---|---|
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | your Gmail address |
   | Password | the app password from step 1 |
   | Sender email | the same Gmail address |
   | Sender name | `WeSplit` |

3. Save, then check Authentication, Rate Limits. It should now read 30 emails per hour, which is far more than two people need.
4. Send yourself a sign-in link and confirm it arrives from your own address rather than a Supabase one.

If Gmail ever throttles or delivery gets flaky, Brevo is the fallback: free tier is 300 a day and it lets you verify a single sender address without owning a domain.

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

**If sign-in emails stop arriving:** you have hit a rate limit. On the built-in service that is 2 per hour; set up custom SMTP as described above. On Gmail it means you have sent 500 in a day, which would be surprising.

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

**Add Supabase's redirect URL.** Back in Supabase: Authentication, URL Configuration. Set Site URL to `https://greg97-git.github.io/wesplit/` and add both that URL and `http://localhost:5174/wesplit/` to Redirect URLs. Magic links won't come back to the app without this.

---

## 4. Install on both phones

On each iPhone, open the Pages URL in **Safari** (not Chrome — only Safari can install to the home screen on iOS), tap Share, then Add to Home Screen. It opens full-screen with no browser chrome.

Sign in on each phone with the matching email. Sofia's profile row is created the first time she signs in.

**Recurring expenses.** Supabase Dashboard, Database, Extensions, search `pg_cron`, enable it. Then re-run the last block of `schema.sql` (the `do $$ ... cron.schedule ... $$` at the bottom) to register the daily job. Without this, expenses marked as repeating simply never generate copies; nothing else breaks.

---

## Things worth knowing

**The anon key is public.** It identifies the project, it doesn't grant access. Every table has RLS on with policies that require a row in `profiles`, and profiles are only created for allowlisted emails. Someone reading the key out of your JavaScript gets nothing.

**Sign-in is once per device, not once per session.** The session lives in that browser's storage and refreshes itself, so opening the app from the home screen never asks for anything. You will only see the login screen again after signing out, clearing site data, reinstalling the PWA, or leaving it unopened for weeks.

**Free Supabase projects pause after seven days of no activity.** Daily use means you'll never see it. If the app ever seems dead, check the dashboard — one click resumes it.

**The service worker caches the app shell, not your data.** Expenses always come from the network. If you ship a change and the phone shows the old version, close the app fully and reopen; `registerType: autoUpdate` picks it up on next launch.

**Changing the app icon.** iOS uses `public/apple-touch-icon.png` (180x180, no transparency, square — iOS rounds the corners itself). Android and desktop use `public/icon-192.png` and `icon-512.png`, listed in the manifest block of `vite.config.js`. Replace the files, keep the names, push.

iOS caches the icon hard. After deploying a new one, remove the app from the home screen and add it again — refreshing won't do it.

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
