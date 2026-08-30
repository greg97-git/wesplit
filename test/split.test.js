import test from 'node:test'
import assert from 'node:assert/strict'
import { allocate, remainder, formatCents, parseCents } from '../src/split.js'

const G = 'greg'
const S = 'sofia'
const users = [G, S]

const sums = (shares) => Object.values(shares).reduce((a, c) => a + c, 0)

test('equal split of an even amount', () => {
  const r = allocate(10000, users, 'equal')
  assert.deepEqual(r, { greg: 5000, sofia: 5000 })
})

test('equal split of an odd amount never loses or invents a cent', () => {
  for (let total = 0; total <= 2000; total++) {
    const r = allocate(total, users, 'equal')
    assert.equal(sums(r), total, `failed at ${total}`)
  }
})

test('equal split across three people, worst case', () => {
  const three = [G, S, 'x']
  const r = allocate(1000, three, 'equal')
  assert.equal(sums(r), 1000)
  assert.deepEqual(Object.values(r).sort(), [333, 333, 334])
})

test('percent split matches the mockup numbers', () => {
  const r = allocate(12840, users, 'percent', { percents: { greg: 60, sofia: 40 } })
  assert.deepEqual(r, { greg: 7704, sofia: 5136 })
  assert.equal(sums(r), 12840)
})

test('percent split rejects anything that is not 100', () => {
  assert.throws(() => allocate(10000, users, 'percent', { percents: { greg: 60, sofia: 30 } }), /add up to 100/)
})

test('percent split allows fractional percentages that round to 100', () => {
  const three = [G, S, 'x']
  const r = allocate(10000, three, 'percent', {
    percents: { greg: 33.33, sofia: 33.33, x: 33.34 },
  })
  assert.equal(sums(r), 10000)
})

test('percent split always balances across every total', () => {
  for (let total = 0; total <= 3000; total++) {
    const r = allocate(total, users, 'percent', { percents: { greg: 60, sofia: 40 } })
    assert.equal(sums(r), total, `failed at ${total}`)
  }
})

test('exact amounts must equal the total', () => {
  const r = allocate(12840, users, 'exact', { amounts: { greg: 8000, sofia: 4840 } })
  assert.equal(sums(r), 12840)
  assert.throws(
    () => allocate(12840, users, 'exact', { amounts: { greg: 8000, sofia: 4000 } }),
    /off by 840 cents/,
  )
})

test('exact amounts reject floats', () => {
  assert.throws(() => allocate(100, users, 'exact', { amounts: { greg: 50.5, sofia: 49.5 } }), /integer cents/)
})

test('shares split 2:1', () => {
  const r = allocate(9000, users, 'shares', { shares: { greg: 2, sofia: 1 } })
  assert.deepEqual(r, { greg: 6000, sofia: 3000 })
})

test('shares split balances on awkward totals', () => {
  for (let total = 0; total <= 2000; total++) {
    const r = allocate(total, users, 'shares', { shares: { greg: 2, sofia: 1 } })
    assert.equal(sums(r), total, `failed at ${total}`)
  }
})

test('shares split rejects all-zero weights', () => {
  assert.throws(() => allocate(100, users, 'shares', { shares: { greg: 0, sofia: 0 } }), /more than zero/)
})

test('full owed by one person', () => {
  const r = allocate(12840, users, 'full', { owedBy: S })
  assert.deepEqual(r, { greg: 0, sofia: 12840 })
})

test('full rejects a non-participant', () => {
  assert.throws(() => allocate(100, users, 'full', { owedBy: 'nobody' }), /must be a participant/)
})

test('remainder drives the validator', () => {
  assert.equal(remainder(12840, { greg: 7704, sofia: 5136 }), 0)
  assert.equal(remainder(12840, { greg: 7704, sofia: 5000 }), 136)
})

test('totals are rejected if they are not integer cents', () => {
  assert.throws(() => allocate(128.4, users, 'equal'), /integer cents/)
})

test('formatCents', () => {
  assert.equal(formatCents(12840), '$128.40')
  assert.equal(formatCents(240000), '$2,400.00')
  assert.equal(formatCents(0), '$0.00')
  assert.equal(formatCents(-12600), '−$126.00')
  assert.equal(formatCents(4210, { sign: true }), '+$42.10')
})

test('parseCents handles what a person actually types', () => {
  assert.equal(parseCents('128.40'), 12840)
  assert.equal(parseCents('$1,116.10'), 111610)
  assert.equal(parseCents('12'), 1200)
  assert.equal(parseCents('0.1'), 10)
  assert.equal(parseCents(''), null)
  assert.equal(parseCents('abc'), null)
})

test('parse then format round-trips', () => {
  for (const s of ['0.01', '0.10', '1.00', '19.99', '2400.00', '1116.10']) {
    assert.equal(formatCents(parseCents(s)), `$${Number(s).toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
  }
})
