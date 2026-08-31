import { useEffect, useMemo, useState } from 'react'
import { configured } from './supabase.js'
import {
  useSession, useAppData, sendMagicLink, verifyCode, signOut,
  createExpense, updateExpense, deleteExpense, createSettlement,
} from './data.js'
import { allocate, remainder, formatCents, parseCents } from './split.js'
import { Icon, Avatar, CategoryTile } from './icons.jsx'

const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Dates are plain YYYY-MM-DD. Parse them as local, never as UTC midnight. */
function localDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const monthKey = (iso) => iso.slice(0, 7)
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
const longDate = (iso) => {
  const d = localDate(iso)
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

// ---------------------------------------------------------------------------

export default function App() {
  const session = useSession()

  if (!configured) {
    return (
      <Centered>
        <h2>Not configured yet</h2>
        <p className="muted small">
          Copy <code>.env.example</code> to <code>.env.local</code>, paste in your Supabase
          URL and anon key, then restart <code>npm run dev</code>.
        </p>
      </Centered>
    )
  }
  if (session === undefined) return <Centered><p className="muted">Loading…</p></Centered>
  if (!session) return <AuthScreen />
  return <Shell session={session} />
}

function Centered({ children }) {
  return (
    <div className="app">
      <div className="scroll pad center-col" style={{ justifyContent: 'center', textAlign: 'center', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AuthScreen() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function requestCode(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await sendMagicLink(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verifyCode(email, code)
      // On success the session listener swaps this screen out; nothing to do.
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="scroll pad" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <div className="center-col" style={{ gap: 8 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--green)' }}>WeSplit</div>
          <div className="muted small">Shared expenses, just the two of you.</div>
        </div>

        {sent ? (
          <form onSubmit={submitCode} className="stack">
            <div className="center-col" style={{ gap: 8, textAlign: 'center' }}>
              <Icon name="mail" size={30} color="var(--green)" />
              <div style={{ fontSize: 16, fontWeight: 600 }}>Enter the code we emailed</div>
              <div className="muted small">Sent to {email}. It expires in an hour.</div>
            </div>

            <input
              className="amount-input"
              style={{ textAlign: 'center', letterSpacing: '0.18em', fontVariantNumeric: 'tabular-nums' }}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from the email"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />

            <button className="btn primary" disabled={busy || code.length < 6}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="muted small" style={{ textAlign: 'center', lineHeight: 1.5 }}>
              The same email has a link in it. On a phone, use the code — tapping the
              link opens Safari, which signs in the browser rather than this app.
            </div>

            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setSent(false)
                setCode('')
                setError(null)
              }}
            >
              Start over
            </button>
          </form>
        ) : (
          <form onSubmit={requestCode} className="stack">
            <input
              className="text-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="btn primary" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Email me a sign-in code'}
            </button>
            <div className="muted small" style={{ textAlign: 'center' }}>
              No password. Signing in once on a device keeps it signed in.
            </div>
          </form>
        )}

        {error && <div className="error">{error}</div>}

        <div className="muted" style={{ textAlign: 'center', fontSize: 11, opacity: 0.6 }}>
          build {__BUILD__}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Shell({ session }) {
  const data = useAppData(session)
  const [view, setView] = useState({ name: 'home' })

  if (data.loading) return <Centered><p className="muted">Loading…</p></Centered>

  if (data.error) {
    return (
      <Centered>
        <h3>Something went wrong</h3>
        <div className="error">{data.error.message}</div>
        <button className="btn ghost" onClick={data.reload}>Try again</button>
      </Centered>
    )
  }

  if (!data.me) {
    return (
      <Centered>
        <h3>No access</h3>
        <p className="muted small">
          You're signed in as {session.user.email}, but that address isn't on the allowlist, so
          there's nothing to show. Add it to <code>allowed_emails</code> in Supabase.
        </p>
        <button className="btn ghost" onClick={signOut}>Sign out</button>
      </Centered>
    )
  }

  const other = data.people.find((p) => p.id !== data.me.id) ?? null
  const ctx = { ...data, other, session, setView }

  switch (view.name) {
    case 'add':
      return <ExpenseEditor ctx={ctx} expenseId={view.id} />
    case 'detail':
      return <DetailScreen ctx={ctx} expenseId={view.id} />
    case 'settle':
      return <SettleScreen ctx={ctx} />
    case 'summary':
      return <SummaryScreen ctx={ctx} />
    case 'account':
      return <AccountScreen ctx={ctx} />
    default:
      return <HomeScreen ctx={ctx} />
  }
}

// ---------------------------------------------------------------------------

function netFor(balances, userId) {
  return balances.find((b) => b.user_id === userId)?.net_cents ?? 0
}

function HomeScreen({ ctx }) {
  const { me, other, expenses, settlements, categories, balances, setView } = ctx
  const net = netFor(balances, me.id)

  const items = useMemo(() => {
    const merged = [
      ...expenses.map((e) => ({ kind: 'expense', date: e.spent_on, created: e.created_at, data: e })),
      ...settlements.map((s) => ({ kind: 'settlement', date: s.settled_on, created: s.created_at, data: s })),
    ]
    merged.sort((a, b) => (a.date === b.date ? b.created.localeCompare(a.created) : b.date.localeCompare(a.date)))

    const groups = []
    for (const item of merged) {
      const key = monthKey(item.date)
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] })
      groups[groups.length - 1].items.push(item)
    }
    return groups
  }, [expenses, settlements])

  return (
    <div className="app">
      <div className="nav">
        <div className="avatar" style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--green)', fontSize: 13 }}>
          {me.initials}{other?.initials ?? ''}
        </div>
        <div className="row-main">
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {me.display_name}{other ? ` & ${other.display_name}` : ''}
          </div>
          <div className="row-sub">{ctx.people.length} people</div>
        </div>
        <button
          className="pill"
          style={{ borderColor: 'var(--green)', color: 'var(--green)' }}
          onClick={() => setView({ name: 'settle' })}
          disabled={!other}
        >
          Settle up
        </button>
      </div>

      <div className={`banner${net === 0 ? ' settled' : ''}`}>
        {!other ? (
          <>Waiting for {`the second person`} to sign in for the first time.</>
        ) : net > 0 ? (
          <>{other.display_name} owes you <b className="pos">{formatCents(net)}</b></>
        ) : net < 0 ? (
          <>You owe {other.display_name} <b className="neg">{formatCents(-net)}</b></>
        ) : (
          <>You're all settled up.</>
        )}
      </div>

      <div className="scroll">
        {items.length === 0 && (
          <div className="pad center-col muted small" style={{ gap: 6, paddingTop: 48 }}>
            <div>No expenses yet.</div>
            <div>Add the first one below.</div>
          </div>
        )}
        {items.map((group) => (
          <div key={group.key}>
            <div className="strip">{monthLabel(group.key)}</div>
            {group.items.map((item) =>
              item.kind === 'expense' ? (
                <ExpenseRow
                  key={item.data.id}
                  expense={item.data}
                  me={me}
                  people={ctx.people}
                  categories={categories}
                  onOpen={() => setView({ name: 'detail', id: item.data.id })}
                />
              ) : (
                <SettlementRow key={item.data.id} settlement={item.data} me={me} people={ctx.people} />
              ),
            )}
          </div>
        ))}
      </div>

      <div className="fab-wrap">
        <button className="fab" onClick={() => setView({ name: 'add' })} disabled={!other}>
          <Icon name="plus" size={18} width={2.2} />
          Add expense
        </button>
      </div>

      <div className="tabbar">
        <button className="on"><Icon name="list" /><span>Expenses</span></button>
        <button onClick={() => setView({ name: 'summary' })}><Icon name="chart" /><span>Totals</span></button>
        <button onClick={() => setView({ name: 'account' })}><Icon name="person" /><span>Account</span></button>
      </div>
    </div>
  )
}

function ExpenseRow({ expense, me, people, categories, onOpen }) {
  const payer = people.find((p) => p.id === expense.paid_by)
  const myShare = expense.expense_shares.find((s) => s.user_id === me.id)?.share_cents ?? 0
  const paidByMe = expense.paid_by === me.id
  // What this expense did to the balance, from my side.
  const delta = (paidByMe ? expense.amount_cents : 0) - myShare
  const category = categories.find((c) => c.id === expense.category_id)
  const d = localDate(expense.spent_on)

  return (
    <button className="row" onClick={onOpen}>
      <div className="datecol">
        <div className="datecol-m">{MONTHS[d.getMonth()]}</div>
        <div className="datecol-d">{d.getDate()}</div>
      </div>
      <CategoryTile icon={category?.icon} />
      <div className="row-main">
        <div className="row-title">
          {expense.description}
          {(expense.recurrence || expense.recurrence_parent) && (
            <Icon name="repeat" size={12} width={2.4} color="var(--faint)" style={{ marginLeft: 6, verticalAlign: -1 }} />
          )}
        </div>
        <div className="row-sub">
          {paidByMe ? 'You' : payer?.display_name ?? 'Someone'} paid {formatCents(expense.amount_cents)}
        </div>
      </div>
      <div className="row-right">
        {delta === 0 ? (
          <div className="row-label muted">not involved</div>
        ) : (
          <>
            <div className={`row-label ${delta > 0 ? 'pos' : 'neg'}`}>
              {delta > 0 ? 'you lent' : 'you borrowed'}
            </div>
            <div className={`row-amount ${delta > 0 ? 'pos' : 'neg'}`}>{formatCents(Math.abs(delta))}</div>
          </>
        )}
      </div>
    </button>
  )
}

function SettlementRow({ settlement, me, people }) {
  const from = people.find((p) => p.id === settlement.from_user)
  const to = people.find((p) => p.id === settlement.to_user)
  const d = localDate(settlement.settled_on)
  return (
    <div className="row" style={{ background: '#fafafa' }}>
      <div className="datecol">
        <div className="datecol-m">{MONTHS[d.getMonth()]}</div>
        <div className="datecol-d muted">{d.getDate()}</div>
      </div>
      <div className="tile" style={{ background: '#e8e8e8' }}>
        <Icon name="swap" size={18} color="#5e5e5e" />
      </div>
      <div className="row-main">
        <div className="row-title muted">
          {from?.id === me.id ? 'You' : from?.display_name} paid{' '}
          {to?.id === me.id ? 'you' : to?.display_name} {formatCents(settlement.amount_cents)}
        </div>
        {settlement.method && <div className="row-sub">{settlement.method}</div>}
      </div>
      <div className="small muted">settled</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expense editor
// ---------------------------------------------------------------------------

const MODE_LABELS = {
  equal: '=',
  exact: '1.23',
  percent: '%',
  shares: 'shares',
  full: 'full',
}
const MODE_BLURB = {
  equal: 'Split the total evenly.',
  exact: 'Enter exactly what each person owes.',
  percent: 'Enter percentages that add up to 100.',
  shares: 'Split in proportion, like 2 shares to 1.',
  full: 'One person owes the whole thing.',
}

function seedInputs(totalCents, ids) {
  const even = totalCents > 0 ? allocate(totalCents, ids, 'equal') : Object.fromEntries(ids.map((i) => [i, 0]))
  return {
    percents: Object.fromEntries(ids.map((id) => [id, Number((100 / ids.length).toFixed(2))])),
    amounts: even,
    shares: Object.fromEntries(ids.map((id) => [id, 1])),
  }
}

function ExpenseEditor({ ctx, expenseId }) {
  const { me, other, people, categories, expenses, setView } = ctx
  const existing = expenseId ? expenses.find((e) => e.id === expenseId) : null
  const ids = useMemo(() => people.map((p) => p.id), [people])

  const [form, setForm] = useState(() => {
    if (existing) {
      const amounts = Object.fromEntries(existing.expense_shares.map((s) => [s.user_id, s.share_cents]))
      const total = existing.amount_cents
      const seeded = seedInputs(total, ids)
      return {
        description: existing.description,
        amountText: (existing.amount_cents / 100).toFixed(2),
        paidBy: existing.paid_by,
        spentOn: existing.spent_on,
        categoryId: existing.category_id,
        note: existing.note ?? '',
        recurrence: existing.recurrence,
        mode: existing.split_mode,
        percents: total
          ? Object.fromEntries(ids.map((id) => [id, Number((((amounts[id] ?? 0) / total) * 100).toFixed(2))]))
          : seeded.percents,
        amounts: { ...seeded.amounts, ...amounts },
        shares: seeded.shares,
        owedBy: ids.find((id) => (amounts[id] ?? 0) === total) ?? ids[0],
      }
    }
    const seeded = seedInputs(0, ids)
    return {
      description: '',
      amountText: '',
      paidBy: me.id,
      spentOn: todayISO(),
      categoryId: null,
      note: '',
      recurrence: null,
      mode: 'equal',
      ...seeded,
      owedBy: other?.id ?? me.id,
    }
  })

  const [splitOpen, setSplitOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const totalCents = parseCents(form.amountText) ?? 0
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // Re-seed the exact-amount boxes when the total changes, so the default is
  // always a valid even split rather than a stale one the user must fix.
  useEffect(() => {
    if (form.mode !== 'exact' && totalCents > 0) {
      set({ amounts: allocate(totalCents, ids, 'equal') })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalCents])

  let shares = null
  let splitError = null
  try {
    shares = totalCents > 0 ? allocate(totalCents, ids, form.mode, form) : null
  } catch (err) {
    splitError = err.message
  }

  const canSave = Boolean(form.description.trim()) && totalCents > 0 && shares && !splitError

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      const payload = {
        description: form.description.trim(),
        amount_cents: totalCents,
        paid_by: form.paidBy,
        category_id: form.categoryId,
        spent_on: form.spentOn,
        note: form.note.trim() || null,
        split_mode: form.mode,
        recurrence: form.recurrence,
      }
      if (existing) {
        await updateExpense(existing.id, payload, shares)
      } else {
        await createExpense({ ...payload, created_by: me.id }, shares)
      }
      setView({ name: 'home' })
    } catch (err) {
      setSaveError(err.message)
      setBusy(false)
    }
  }

  if (splitOpen) {
    return (
      <SplitScreen
        ctx={ctx}
        form={form}
        set={set}
        totalCents={totalCents}
        shares={shares}
        splitError={splitError}
        onDone={() => setSplitOpen(false)}
      />
    )
  }

  const payer = people.find((p) => p.id === form.paidBy)
  const category = categories.find((c) => c.id === form.categoryId)

  return (
    <div className="app">
      <div className="nav">
        <button className="nav-action" onClick={() => setView({ name: 'home' })}>Cancel</button>
        <div className="nav-title" style={{ flex: 1, textAlign: 'center' }}>
          {existing ? 'Edit expense' : 'Add expense'}
        </div>
        <button className="nav-action primary" onClick={save} disabled={!canSave || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="scroll">
        <div className="row" style={{ borderBottom: '1px solid var(--hairline)' }}>
          <div className="small muted">With you and:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Avatar person={other} size={22} />
            <div className="small">{other?.display_name}</div>
          </div>
        </div>

        <div className="amount-entry" style={{ paddingBottom: 4 }}>
          <CategoryTile icon={category?.icon} />
          <input
            className="text-input"
            placeholder="What was it for?"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            autoFocus={!existing}
          />
        </div>

        <div className="amount-entry">
          <div className="cur" style={{ width: 38, textAlign: 'center' }}>$</div>
          <input
            className="amount-input"
            inputMode="decimal"
            placeholder="0.00"
            value={form.amountText}
            onChange={(e) => set({ amountText: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', padding: '4px 16px 18px' }}>
          <span className="small muted">Paid by</span>
          <button
            className="pill"
            onClick={() => set({ paidBy: form.paidBy === me.id ? other.id : me.id })}
          >
            {payer?.id === me.id ? 'you' : payer?.display_name}
          </button>
          <span className="small muted">and split</span>
          <button className="pill" onClick={() => setSplitOpen(true)}>
            {form.mode === 'equal' ? 'equally' : MODE_LABELS[form.mode] === '%' ? 'by percentage' : form.mode === 'exact' ? 'by amount' : form.mode === 'shares' ? 'by shares' : 'in full'}
          </button>
        </div>

        {shares && (
          <div className="row" onClick={() => setSplitOpen(true)} style={{ cursor: 'pointer' }}>
            <Icon name="split" color="var(--faint)" />
            <div className="row-main">
              <div className="row-sub">
                {people.map((p) => `${p.id === me.id ? 'You' : p.display_name} ${formatCents(shares[p.id] ?? 0)}`).join(' · ')}
              </div>
            </div>
            <Icon name="forward" size={16} color="#c4c4c4" width={2} />
          </div>
        )}

        {splitError && <div className="error">{splitError}</div>}

        <label className="row">
          <Icon name="calendar" color="var(--faint)" />
          <div className="row-main"><div className="row-title">Date</div></div>
          <input
            className="field-input"
            type="date"
            value={form.spentOn}
            onChange={(e) => set({ spentOn: e.target.value })}
          />
        </label>

        <label className="row">
          <Icon name="tag" color="var(--faint)" />
          <div className="row-main"><div className="row-title">Category</div></div>
          <select
            className="field-input"
            value={form.categoryId ?? ''}
            onChange={(e) => set({ categoryId: e.target.value || null })}
          >
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="row">
          <Icon name="repeat" color="var(--faint)" />
          <div className="row-main"><div className="row-title">Repeats</div></div>
          <select
            className="field-input"
            value={form.recurrence ?? ''}
            onChange={(e) => set({ recurrence: e.target.value || null })}
          >
            <option value="">Never</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>

        <label className="row">
          <Icon name="notes" color="var(--faint)" />
          <input
            className="field-input"
            style={{ textAlign: 'left' }}
            placeholder="Add notes"
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </label>

        {saveError && <div className="error">{saveError}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SplitScreen({ ctx, form, set, totalCents, shares, splitError, onDone }) {
  const { me, people } = ctx
  const left = shares ? remainder(totalCents, shares) : null
  const ok = Boolean(shares) && !splitError

  function switchMode(mode) {
    // Seed the new mode's inputs from the current allocation so switching
    // never lands you on something invalid.
    const base = seedInputs(totalCents, people.map((p) => p.id))
    if (mode === 'exact' && shares) base.amounts = shares
    set({ mode, ...(mode === 'exact' ? { amounts: base.amounts } : mode === 'percent' ? { percents: base.percents } : mode === 'shares' ? { shares: base.shares } : {}) })
  }

  return (
    <div className="app">
      <div className="nav">
        <button className="nav-action" onClick={onDone}>Back</button>
        <div className="nav-title" style={{ flex: 1, textAlign: 'center' }}>Adjust split</div>
        <button className="nav-action primary" onClick={onDone} disabled={!ok}>Done</button>
      </div>

      <div className="tabs">
        {Object.keys(MODE_LABELS).map((m) => (
          <button key={m} className={`tab${form.mode === m ? ' on' : ''}`} onClick={() => switchMode(m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="center-col" style={{ gap: 3, padding: '18px 16px 14px' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{MODE_BLURB[form.mode]}</div>
        <div className="small muted">{formatCents(totalCents)} total</div>
      </div>

      <div className="scroll">
        {people.map((p) => (
          <div className="row" key={p.id}>
            <Avatar person={p} />
            <div className="row-main">
              <div className="row-title">{p.id === me.id ? 'You' : p.display_name}</div>
              <div className="row-sub">{shares ? formatCents(shares[p.id] ?? 0) : '—'}</div>
            </div>
            {form.mode === 'equal' && <div className="small muted">even</div>}

            {form.mode === 'percent' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  className="num-input"
                  inputMode="decimal"
                  value={form.percents[p.id] ?? ''}
                  onChange={(e) =>
                    set({ percents: { ...form.percents, [p.id]: Number(e.target.value) || 0 } })
                  }
                />
                <span className="muted">%</span>
              </div>
            )}

            {form.mode === 'exact' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="muted">$</span>
                <input
                  className="num-input"
                  inputMode="decimal"
                  value={((form.amounts[p.id] ?? 0) / 100).toFixed(2)}
                  onChange={(e) =>
                    set({ amounts: { ...form.amounts, [p.id]: parseCents(e.target.value) ?? 0 } })
                  }
                />
              </div>
            )}

            {form.mode === 'shares' && (
              <input
                className="num-input"
                inputMode="numeric"
                value={form.shares[p.id] ?? ''}
                onChange={(e) => set({ shares: { ...form.shares, [p.id]: Number(e.target.value) || 0 } })}
              />
            )}

            {form.mode === 'full' && (
              <button
                className={`chip${form.owedBy === p.id ? ' on' : ''}`}
                onClick={() => set({ owedBy: p.id })}
              >
                {form.owedBy === p.id ? 'owes it all' : 'owes nothing'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className={`footer-validator${ok ? '' : ' bad'}`}>
        <div className="row-main">
          {ok ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700 }} className="pos">Adds up</div>
              <div className="small muted">{formatCents(left)} left to allocate</div>
            </>
          ) : (
            <div className="small" style={{ color: '#8a452a', lineHeight: 1.4 }}>{splitError}</div>
          )}
        </div>
        {ok && <Icon name="check" size={22} width={2.4} color="var(--green)" />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DetailScreen({ ctx, expenseId }) {
  const { me, people, categories, expenses, setView } = ctx
  const expense = expenses.find((e) => e.id === expenseId)
  const [busy, setBusy] = useState(false)

  if (!expense) {
    return (
      <Centered>
        <p className="muted">That expense is gone.</p>
        <button className="btn ghost" onClick={() => setView({ name: 'home' })}>Back</button>
      </Centered>
    )
  }

  const payer = people.find((p) => p.id === expense.paid_by)
  const category = categories.find((c) => c.id === expense.category_id)
  const share = (id) => expense.expense_shares.find((s) => s.user_id === id)?.share_cents ?? 0

  async function remove() {
    setBusy(true)
    try {
      await deleteExpense(expense.id)
      setView({ name: 'home' })
    } catch (err) {
      alert(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="nav">
        <button className="nav-action" onClick={() => setView({ name: 'home' })}>
          <Icon name="back" size={22} width={2} color="var(--ink)" />
        </button>
        <div style={{ flex: 1 }} />
        <button className="nav-action" style={{ minWidth: 44, justifyContent: 'center' }} onClick={() => setView({ name: 'add', id: expense.id })}>
          <Icon name="edit" color="#5e5e5e" />
        </button>
      </div>

      <div className="scroll">
        <div style={{ display: 'flex', gap: 14, padding: '22px 16px 20px' }}>
          <div className="tile" style={{ width: 54, height: 54, borderRadius: 8, fontSize: 24 }}>
            <CategoryTile icon={category?.icon} />
          </div>
          <div className="row-main" style={{ gap: 5 }}>
            <div style={{ fontSize: 21, fontWeight: 600 }}>{expense.description}</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{formatCents(expense.amount_cents)}</div>
            <div className="small muted">
              {payer?.id === me.id ? 'You' : payer?.display_name} paid on {longDate(expense.spent_on)}
            </div>
          </div>
        </div>

        {people.map((p) => (
          <div className="row" key={p.id}>
            <Avatar person={p} />
            <div className="row-main">
              <div className="row-title">
                {p.id === me.id ? 'You owe' : `${p.display_name} owes`} <b>{formatCents(share(p.id))}</b>
                {p.id === expense.paid_by && <span className="muted small"> · paid {formatCents(expense.amount_cents)}</span>}
              </div>
            </div>
          </div>
        ))}

        <div className="row" style={{ background: 'var(--orange-tint)' }}>
          <Icon name="split" color="var(--orange)" width={2} />
          <div className="row-main">
            <div className="small" style={{ color: '#8a452a' }}>
              {expense.split_mode === 'equal' && 'Split equally'}
              {expense.split_mode === 'percent' && 'Split by percentage'}
              {expense.split_mode === 'exact' && 'Split by exact amounts'}
              {expense.split_mode === 'shares' && 'Split by shares'}
              {expense.split_mode === 'full' && 'One person owes the full amount'}
            </div>
          </div>
        </div>

        {category && (
          <div className="row">
            <Icon name="tag" color="var(--faint)" />
            <div className="row-main"><div className="row-title muted">Category</div></div>
            <div>{category.name}</div>
          </div>
        )}

        {(expense.recurrence || expense.recurrence_parent) && (
          <div className="row">
            <Icon name="repeat" color="var(--faint)" />
            <div className="row-main">
              <div className="row-title muted">
                {expense.recurrence ? `Repeats ${expense.recurrence}` : 'Generated from a repeating expense'}
              </div>
            </div>
          </div>
        )}

        {expense.note && (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Icon name="notes" color="var(--faint)" />
            <div className="row-main"><div style={{ fontSize: 15, lineHeight: 1.4 }}>{expense.note}</div></div>
          </div>
        )}

        <div className="pad">
          <button className="btn danger" onClick={remove} disabled={busy}>
            <Icon name="trash" size={16} width={2} />
            {busy ? 'Deleting…' : 'Delete expense'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SettleScreen({ ctx }) {
  const { me, other, balances, setView } = ctx
  const net = netFor(balances, me.id)
  // Whoever is behind pays. net > 0 means they owe me.
  const fromUser = net > 0 ? other : me
  const toUser = net > 0 ? me : other
  const owed = Math.abs(net)

  const [amountText, setAmountText] = useState((owed / 100).toFixed(2))
  const [method, setMethod] = useState('e-transfer')
  const [settledOn, setSettledOn] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const cents = parseCents(amountText) ?? 0
  const partial = cents !== owed
  const canSave = cents > 0 && !!other

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await createSettlement({
        from_user: fromUser.id,
        to_user: toUser.id,
        amount_cents: cents,
        method: method || null,
        settled_on: settledOn,
        created_by: me.id,
      })
      setView({ name: 'home' })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <div className="nav">
        <button className="nav-action" onClick={() => setView({ name: 'home' })}>Cancel</button>
        <div className="nav-title" style={{ flex: 1, textAlign: 'center' }}>Record a payment</div>
        <button className="nav-action primary" onClick={save} disabled={!canSave || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="scroll">
        {owed === 0 ? (
          <div className="pad center-col muted" style={{ gap: 8, paddingTop: 40 }}>
            <Icon name="check" size={28} color="var(--green)" width={2.4} />
            <div>You're already settled up.</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '28px 16px 10px' }}>
              <div className="center-col" style={{ gap: 8 }}>
                <Avatar person={fromUser} size={58} />
                <div className="small muted">{fromUser.id === me.id ? 'you pay' : `${fromUser.display_name} paid`}</div>
              </div>
              <Icon name="arrow" size={30} color="#c4c4c4" />
              <div className="center-col" style={{ gap: 8 }}>
                <Avatar person={toUser} size={58} />
                <div className="small muted">{toUser.id === me.id ? 'you' : toUser.display_name}</div>
              </div>
            </div>

            <div className="center-col" style={{ gap: 6, padding: '20px 16px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 26, color: 'var(--faint)' }}>$</span>
                <input
                  className="amount-input"
                  style={{ maxWidth: 200, textAlign: 'center' }}
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
              </div>
              <div className="small muted">
                {partial ? `Partial — ${formatCents(owed - cents)} would still be owed` : 'Full balance owed'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '0 16px 18px' }}>
              <button
                className={`btn ${cents === owed ? 'primary' : 'ghost'}`}
                onClick={() => setAmountText((owed / 100).toFixed(2))}
              >
                Full amount
              </button>
            </div>

            <label className="row">
              <Icon name="calendar" color="var(--faint)" />
              <div className="row-main"><div className="row-title">Date</div></div>
              <input className="field-input" type="date" value={settledOn} onChange={(e) => setSettledOn(e.target.value)} />
            </label>

            <label className="row">
              <Icon name="card" color="var(--faint)" />
              <div className="row-main"><div className="row-title">Method</div></div>
              <input className="field-input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="e-transfer" />
            </label>

            <div className="row" style={{ alignItems: 'flex-start', borderBottom: 'none' }}>
              <Icon name="info" color="var(--faint)" />
              <div className="row-main">
                <div className="small muted" style={{ lineHeight: 1.5 }}>
                  This records a payment and moves the balance. Every expense stays in your history.
                </div>
              </div>
            </div>

            {error && <div className="error">{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SummaryScreen({ ctx }) {
  const { me, people, expenses, categories, setView } = ctx

  const months = useMemo(() => {
    const set = new Set(expenses.map((e) => monthKey(e.spent_on)))
    return [...set].sort().reverse()
  }, [expenses])

  const [month, setMonth] = useState(months[0] ?? monthKey(todayISO()))
  const idx = months.indexOf(month)

  const inMonth = expenses.filter((e) => monthKey(e.spent_on) === month)
  const total = inMonth.reduce((a, e) => a + e.amount_cents, 0)

  const byCategory = useMemo(() => {
    const map = new Map()
    for (const e of inMonth) {
      const name = categories.find((c) => c.id === e.category_id)?.name ?? 'Uncategorized'
      map.set(name, (map.get(name) ?? 0) + e.amount_cents)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [inMonth, categories])

  const max = byCategory[0]?.[1] ?? 1

  const fronted = people.map((p) => ({
    person: p,
    cents: inMonth.filter((e) => e.paid_by === p.id).reduce((a, e) => a + e.amount_cents, 0),
  }))

  return (
    <div className="app">
      <div className="nav">
        <button
          className="nav-action"
          style={{ minWidth: 44 }}
          disabled={idx >= months.length - 1}
          onClick={() => setMonth(months[idx + 1])}
        >
          <Icon name="back" color={idx >= months.length - 1 ? '#d5d5d5' : 'var(--ink)'} width={2} />
        </button>
        <div className="nav-title" style={{ flex: 1, textAlign: 'center' }}>{monthLabel(month)}</div>
        <button
          className="nav-action"
          style={{ minWidth: 44, justifyContent: 'flex-end' }}
          disabled={idx <= 0}
          onClick={() => setMonth(months[idx - 1])}
        >
          <Icon name="forward" color={idx <= 0 ? '#d5d5d5' : 'var(--ink)'} width={2} />
        </button>
      </div>

      <div className="scroll">
        <div className="center-col" style={{ gap: 5, padding: '22px 16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div className="small muted">Total you spent together</div>
          <div style={{ fontSize: 34, fontWeight: 700 }}>{formatCents(total)}</div>
          <div className="small muted">{inMonth.length} expense{inMonth.length === 1 ? '' : 's'}</div>
        </div>

        <div className="strip">By category</div>
        <div className="pad stack" style={{ gap: 13 }}>
          {byCategory.length === 0 && <div className="muted small">Nothing logged this month.</div>}
          {byCategory.map(([name, cents]) => (
            <div key={name} className="stack" style={{ gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 15 }}>{name}</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{formatCents(cents)}</div>
              </div>
              <div className="bar"><div style={{ width: `${Math.round((cents / max) * 100)}%` }} /></div>
            </div>
          ))}
        </div>

        <div className="strip">Who fronted the money</div>
        <div className="pad stack" style={{ gap: 11 }}>
          <div style={{ display: 'flex', height: 11, borderRadius: 999, overflow: 'hidden', background: 'var(--tile)' }}>
            {fronted.map((f) => (
              <div
                key={f.person.id}
                style={{ width: total ? `${(f.cents / total) * 100}%` : '0%', background: f.person.color }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {fronted.map((f) => (
              <div key={f.person.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 9, height: 9, borderRadius: 999, background: f.person.color }} />
                <div className="small" style={{ color: '#5e5e5e' }}>
                  {f.person.id === me.id ? 'You' : f.person.display_name} — {formatCents(f.cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tabbar">
        <button onClick={() => setView({ name: 'home' })}><Icon name="list" /><span>Expenses</span></button>
        <button className="on"><Icon name="chart" /><span>Totals</span></button>
        <button onClick={() => setView({ name: 'account' })}><Icon name="person" /><span>Account</span></button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function AccountScreen({ ctx }) {
  const { me, other, session, setView } = ctx

  return (
    <div className="app">
      <div className="nav">
        <div className="nav-title" style={{ flex: 1 }}>Account</div>
      </div>

      <div className="scroll">
        <div className="center-col" style={{ gap: 10, padding: '28px 16px' }}>
          <Avatar person={me} size={64} />
          <div style={{ fontSize: 19, fontWeight: 600 }}>{me.display_name}</div>
          <div className="muted small">{session.user.email}</div>
        </div>

        {other && (
          <div className="row">
            <Avatar person={other} size={34} />
            <div className="row-main">
              <div className="row-title">{other.display_name}</div>
              <div className="row-sub">Shares expenses with you</div>
            </div>
          </div>
        )}

        <div className="pad">
          <button className="btn danger" onClick={signOut}>
            <Icon name="person" size={16} width={2} />
            Sign out
          </button>
        </div>
      </div>

      <div className="tabbar">
        <button onClick={() => setView({ name: 'home' })}><Icon name="list" /><span>Expenses</span></button>
        <button onClick={() => setView({ name: 'summary' })}><Icon name="chart" /><span>Totals</span></button>
        <button className="on"><Icon name="person" /><span>Account</span></button>
      </div>
    </div>
  )
}
