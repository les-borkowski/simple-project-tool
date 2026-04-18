import type { Status } from '../../services/api'

const STATUS_CLS: Record<Status, string> = {
  to_do: 'st-todo',
  in_progress: 'st-prog',
  in_review: 'st-rev',
  in_testing: 'st-test',
  done: 'st-done',
}

const STATUS_LABEL: Record<Status, string> = {
  to_do: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  in_testing: 'In testing',
  done: 'Done',
}

export function StatusPill({ status, size = 'sm' }: { status: Status; size?: 'sm' | 'lg' }) {
  return (
    <span className={`st-pill ${STATUS_CLS[status]}`} style={{ fontSize: size === 'lg' ? 12 : 11 }}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  )
}
