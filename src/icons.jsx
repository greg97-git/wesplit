const paths = {
  back: <path d="M15 6l-6 6 6 6" />,
  forward: <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M20 6L9 17l-5-5" />,
  swap: (
    <>
      <path d="M17 3l4 4-4 4" /><path d="M21 7H8" />
      <path d="M7 21l-4-4 4-4" /><path d="M3 17h13" />
    </>
  ),
  arrow: <><path d="M4 12h15" /><path d="M14 7l5 5-5 5" /></>,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  repeat: (
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
    </>
  ),
  notes: <path d="M4 6h16M4 12h16M4 18h9" />,
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  chart: <path d="M4 19V9M10 19V5M16 19v-6M22 19H2" />,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  card: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /></>,
  tag: <><path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M7 13h10" /></>,
  trash: <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />,
  edit: <><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  split: <><path d="M12 3v18" /><circle cx="7" cy="8" r="3" /><circle cx="17" cy="16" r="3" /></>,
  mail: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
}

export function Icon({ name, size = 20, color = 'currentColor', width = 1.8, style }) {
  const d = paths[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {d}
    </svg>
  )
}

// Category glyphs. Text rather than SVG so adding a category in SQL needs no
// code change; anything unrecognised falls back to a receipt.
const categoryGlyph = {
  cart: '🛒', home: '🏠', bolt: '💡', fork: '🍽', car: '🚗', plane: '✈️',
  paw: '🐾', heart: '💊', box: '📦', ticket: '🎟', receipt: '🧾',
}

export function CategoryTile({ icon }) {
  return <div className="tile">{categoryGlyph[icon] ?? categoryGlyph.receipt}</div>
}

export function Avatar({ person, size = 40 }) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        background: person?.color ?? '#909090',
        fontSize: Math.round(size * 0.38),
      }}
    >
      {person?.initials ?? '?'}
    </div>
  )
}
