import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function useSession() {
  const [session, setSession] = useState(undefined) // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  return session
}

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: window.location.href.split('#')[0] },
  })
  if (error) throw error
}

/**
 * Sign in with the 6-digit code from the same email.
 *
 * This exists because of iOS. A home-screen PWA has its own storage, separate
 * from Safari, and there is no way to make a link open inside the installed
 * app. Tapping the link signs Safari in and leaves the app at the login
 * screen. A code never leaves the app, so it works everywhere. It also
 * survives corporate mail scanners, which pre-fetch links and can burn the
 * single-use token before you ever tap it.
 */
export async function verifyCode(email, token) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  })
  if (error) throw error
}

export async function signOut() {
  await supabase.auth.signOut()
}

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------
// One hook loads the whole dataset. Two people and a few thousand rows is
// nothing; paginating this would be premature. Realtime just re-runs the load.

const EXPENSE_SELECT = `
  id, description, amount_cents, currency, paid_by, category_id, spent_on,
  note, split_mode, recurrence, recurrence_parent, created_by, created_at,
  expense_shares ( user_id, share_cents )
`

export function useAppData(session) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    me: null,
    people: [],
    categories: [],
    expenses: [],
    settlements: [],
    balances: [],
  })
  const mounted = useRef(true)

  const load = useCallback(async () => {
    if (!session) return
    try {
      const [people, categories, expenses, settlements, balances] = await Promise.all([
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('categories').select('*').order('sort_order'),
        supabase
          .from('expenses')
          .select(EXPENSE_SELECT)
          .is('deleted_at', null)
          .order('spent_on', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('settlements')
          .select('*')
          .is('deleted_at', null)
          .order('settled_on', { ascending: false }),
        supabase.from('user_balances').select('*'),
      ])

      const firstError = [people, categories, expenses, settlements, balances].find((r) => r.error)
      if (firstError) throw firstError.error
      if (!mounted.current) return

      setState({
        loading: false,
        error: null,
        me: people.data.find((p) => p.id === session.user.id) ?? null,
        people: people.data,
        categories: categories.data,
        expenses: expenses.data,
        settlements: settlements.data,
        balances: balances.data,
      })
    } catch (err) {
      if (!mounted.current) return
      setState((s) => ({ ...s, loading: false, error: err }))
    }
  }, [session])

  useEffect(() => {
    mounted.current = true
    load()
    return () => {
      mounted.current = false
    }
  }, [load])

  // Realtime. Any change to any of the three tables, on either phone, reloads.
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('wesplit')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_shares' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session, load])

  return { ...state, reload: load }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Create or update an expense together with its shares.
 *
 * Both writes go through one database function on purpose. The balance
 * trigger is deferred to the end of the transaction, and PostgREST gives the
 * browser no way to open a transaction across two calls — so writing the
 * expense and then the shares separately means the first one commits alone,
 * with no shares, and the trigger rejects it. One RPC, one transaction.
 */
async function saveExpense(id, expense, shares) {
  const { data, error } = await supabase.rpc('save_expense', {
    p_id: id,
    p_description: expense.description,
    p_amount_cents: expense.amount_cents,
    p_paid_by: expense.paid_by,
    p_category_id: expense.category_id,
    p_spent_on: expense.spent_on,
    p_note: expense.note,
    p_split_mode: expense.split_mode,
    p_recurrence: expense.recurrence,
    p_shares: shares,
  })
  if (error) throw error
  return data
}

export function createExpense(expense, shares) {
  return saveExpense(null, expense, shares)
}

export function updateExpense(id, expense, shares) {
  return saveExpense(id, expense, shares)
}

/** Soft delete, so a mistap is recoverable in the SQL editor. */
export async function deleteExpense(id) {
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function createSettlement(row) {
  const { error } = await supabase.from('settlements').insert(row)
  if (error) throw error
}

export async function deleteSettlement(id) {
  const { error } = await supabase
    .from('settlements')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
