// Split allocation.
//
// Every mode produces a map of userId -> integer cents that sums EXACTLY to
// the expense total. All money in this app is integer cents; nothing here
// ever sees a float that reaches the database.
//
// The interesting part is remainders. $10.01 split evenly between two people
// does not divide. Rounding each share independently either loses a cent or
// invents one, so instead we floor every share and then hand out the leftover
// cents one at a time by largest fractional remainder, breaking ties by a
// stable order. The result is deterministic: the same inputs always produce
// the same allocation, on either phone.

export const MODES = ['equal', 'exact', 'percent', 'shares', 'full']

/**
 * Distribute `total` across weights, largest remainder method.
 * @param {number} total integer cents
 * @param {Array<{id: string, weight: number}>} weights non-negative
 * @returns {Record<string, number>} integer cents, summing to `total`
 */
function distributeByWeight(total, weights) {
  const sum = weights.reduce((a, w) => a + w.weight, 0)
  if (sum <= 0) throw new Error('Split weights must add up to more than zero')

  const exact = weights.map((w) => ({
    id: w.id,
    raw: (total * w.weight) / sum,
  }))

  const out = {}
  let allocated = 0
  for (const e of exact) {
    const floored = Math.floor(e.raw)
    out[e.id] = floored
    allocated += floored
  }

  let leftover = total - allocated
  // Hand out remaining cents by largest fractional part. Ties break on the
  // original order, which is stable across devices.
  const byRemainder = exact
    .map((e, i) => ({ id: e.id, frac: e.raw - Math.floor(e.raw), i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  let i = 0
  while (leftover > 0) {
    out[byRemainder[i % byRemainder.length].id] += 1
    leftover -= 1
    i += 1
  }
  // Negative leftover can only happen if a weight was negative, which we
  // rejected above, but guard anyway rather than silently returning bad data.
  if (leftover !== 0) throw new Error('Allocation did not balance')

  return out
}

/**
 * @param {number} totalCents
 * @param {string[]} userIds participants, in stable order
 * @param {string} mode one of MODES
 * @param {object} inputs mode-specific, see below
 * @returns {Record<string, number>} userId -> cents owed
 */
export function allocate(totalCents, userIds, mode, inputs = {}) {
  if (!Number.isInteger(totalCents)) throw new Error('Total must be integer cents')
  if (totalCents < 0) throw new Error('Total cannot be negative')
  if (userIds.length === 0) throw new Error('Need at least one participant')

  switch (mode) {
    case 'equal':
      return distributeByWeight(totalCents, userIds.map((id) => ({ id, weight: 1 })))

    case 'shares': {
      // inputs.shares: { userId: number }, e.g. 2 shares to 1
      const weights = userIds.map((id) => ({ id, weight: Number(inputs.shares?.[id] ?? 0) }))
      if (weights.some((w) => !Number.isFinite(w.weight) || w.weight < 0)) {
        throw new Error('Shares must be zero or more')
      }
      return distributeByWeight(totalCents, weights)
    }

    case 'percent': {
      // inputs.percents: { userId: number }, must total 100
      const pcts = userIds.map((id) => Number(inputs.percents?.[id] ?? 0))
      const sum = pcts.reduce((a, p) => a + p, 0)
      // Compare on a rounded basis so 33.33 + 33.33 + 33.34 passes.
      if (Math.round(sum * 100) !== 10000) {
        throw new Error(`Percentages must add up to 100 (currently ${sum})`)
      }
      return distributeByWeight(totalCents, userIds.map((id, i) => ({ id, weight: pcts[i] })))
    }

    case 'exact': {
      // inputs.amounts: { userId: integer cents }, must total the expense
      const out = {}
      let sum = 0
      for (const id of userIds) {
        const v = inputs.amounts?.[id] ?? 0
        if (!Number.isInteger(v)) throw new Error('Exact amounts must be integer cents')
        if (v < 0) throw new Error('Exact amounts cannot be negative')
        out[id] = v
        sum += v
      }
      if (sum !== totalCents) {
        throw new Error(`Amounts must add up to the total (off by ${totalCents - sum} cents)`)
      }
      return out
    }

    case 'full': {
      // inputs.owedBy: the one person who owes the whole thing
      const owedBy = inputs.owedBy
      if (!userIds.includes(owedBy)) throw new Error('owedBy must be a participant')
      const out = {}
      for (const id of userIds) out[id] = id === owedBy ? totalCents : 0
      return out
    }

    default:
      throw new Error(`Unknown split mode: ${mode}`)
  }
}

/** How much of the total is still unallocated. Drives the footer validator. */
export function remainder(totalCents, shares) {
  const sum = Object.values(shares).reduce((a, c) => a + c, 0)
  return totalCents - sum
}

/** "12840" -> "$128.40". Display only; never round-trip through this. */
export function formatCents(cents, { sign = false } = {}) {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const s = `$${(abs / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
  if (sign) return neg ? `−${s}` : `+${s}`
  return neg ? `−${s}` : s
}

/** "128.40" or "128,40" or "$128.40" -> 12840. Returns null if unparseable. */
export function parseCents(text) {
  if (text == null) return null
  const cleaned = String(text).replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  // Round at the boundary, once, rather than trusting float arithmetic later.
  return Math.round(n * 100)
}
