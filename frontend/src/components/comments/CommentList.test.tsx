import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { makeUser } from '../../test/factories'
import { CommentList } from './CommentList'

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>()
  return { ...actual, commentsApi: { ...actual.commentsApi, listForTask: vi.fn() } }
})

import { commentsApi } from '../../services/api'

function comment(over: Record<string, unknown>) {
  return {
    id: 'c1',
    body: 'hello',
    author_id: 'u1',
    author_name: 'Someone',
    author_kind: 'human',
    created_at: '2026-09-01T00:00:00',
    updated_at: '2026-09-01T00:00:00',
    ...over,
  }
}

describe('CommentList author badge', () => {
  it('shows the Bot badge for agent-authored comments only', async () => {
    vi.mocked(commentsApi.listForTask).mockResolvedValue({
      data: { next_cursor: null, items: [
        comment({ id: 'c1', author_name: 'Release bot', author_kind: 'agent' }),
        comment({ id: 'c2', author_name: 'Ada', author_kind: 'human' }),
      ] },
    } as never)

    renderWithProviders(<CommentList itemType="task" itemId="t1" />, {
      auth: { user: makeUser({ id: 'me' }), isAuthenticated: true },
    })

    expect(await screen.findByText('Release bot')).toBeInTheDocument()
    expect(screen.getAllByText('Bot')).toHaveLength(1)
    expect(screen.getByText('Release bot').textContent).toContain('Bot')
    expect(screen.getByText('Ada').textContent).not.toContain('Bot')
  })
})
