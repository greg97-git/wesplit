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
 * Insert an expense and its shares. The deferred constraint trigger in the
 * database rejects the whole thing if the shares do not add up, so a bad
 * split can never land even if the UI has a bug.
 */
export async function createExpense(expense, shares) {
  const { data, error } = await supabase.from('expenses').insert(expense).select('id').single()
  if (error) throw error

  const rows = Object.entries(shares).map(([user_id, share_cents]) => ({
    expense_id: data.id,
    user_id,
    share_cents,
  }))
  const { error: shareError } = await supabase.from('expense_shares').insert(rows)
  if (shareError) {
    // Roll back by hand: no client-side transactions over PostgREST.
    await supabase.from('expenses').delete().eq('id', data.id)
    throw shareError
  }
  return data.id
}

export async function updateExpense(id, expense, shares) {
  const { error } = await supabase.from('expenses').update(expense).eq('id', id)
  if (error) throw error

  const { error: delError } = await supabase.from('expense_shares').delete().eq('expense_id', id)
  if (delError) throw delError

  const rows = Object.entries(shares).map(([user_id, share_cents]) => ({
    expense_id: id,
    user_id,
    share_cents,
  }))
  const { error: insError } = await supabase.from('expense_shares').insert(rows)
  if (insError) throw insError
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
