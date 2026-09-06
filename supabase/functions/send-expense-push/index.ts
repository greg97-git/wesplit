// Fires on a Database Webhook (expenses, INSERT) and pushes a notification
// to every OTHER member's subscribed devices. See README.md in this folder
// for the one-time setup this depends on.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  const payload = await req.json().catch(() => null)
  const expense = payload?.record
  if (!expense) return new Response('ignored', { status: 200 })

  const [{ data: creator }, { data: category }, { data: subs }] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', expense.created_by).maybeSingle(),
    expense.category_id
      ? supabase.from('categories').select('name').eq('id', expense.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .neq('user_id', expense.created_by),
  ])

  const amount = (expense.amount_cents / 100).toFixed(2)
  const title = `${creator?.display_name ?? 'Someone'} added an expense`
  const body =
    `${expense.description} — ${expense.currency} ${amount}` +
    (category?.name ? ` (${category.name})` : '')
  const message = JSON.stringify({ title, body, url: '/wesplit/' })

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
        )
      } catch (err) {
        // 404/410 means the browser dropped the subscription -- stop trying it.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('push failed', sub.id, err)
        }
      }
    }),
  )

  return new Response('ok', { status: 200 })
})
