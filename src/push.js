import { supabase } from './supabase.js'

// Public by design -- it just identifies this app to the push service and is
// meaningless without the private key held by the send-expense-push Edge
// Function. Regenerate both together if this ever needs to change.
const VAPID_PUBLIC_KEY =
  'BF75wu5iX0ytdgBMkxfT97o4RA8tFagcIP9t_r_BBXYedE1THkvEnpKAGRDzpu6M0eSwXXzkUFqC0h_Hgnkq4DQ'

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function getPushSubscription() {
  if (!pushSupported) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// Must run inside a user gesture (a click handler) -- iOS silently ignores
// the permission prompt otherwise.
export async function enablePush(userId) {
  if (!pushSupported) {
    throw new Error('Push notifications need iOS 16.4+ with WeSplit added to your Home Screen.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' },
    )
  if (error) throw error

  return sub
}

export async function disablePush() {
  const sub = await getPushSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
