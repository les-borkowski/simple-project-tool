import type { ProjectStatusResponse } from '../../services/api'

interface StatusPillProps {
  status: string
  statuses?: ProjectStatusResponse[]
  size?: 'sm' | 'lg'
}

export function StatusPill({ status, statuses, size = 'sm' }: StatusPillProps) {
  const found = statuses?.find((s) => s.slug === status)
  const colour = found?.colour ?? '#a8a29e'
  const label = found?.name ?? status

  return (
    <span
      className="st-pill"
      style={{
        fontSize: size === 'lg' ? 12 : 11,
        '--pill-colour': colour,
      } as React.CSSProperties}
    >
      <span className="dot" style={{ background: colour }} />
      {label}
    </span>
  )
}
