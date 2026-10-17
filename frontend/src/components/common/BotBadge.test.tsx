import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '../../test/render'
import { BotBadge } from './BotBadge'

describe('BotBadge', () => {
  it('renders the translated label', () => {
    renderWithProviders(<BotBadge />)
    expect(screen.getByText('Bot')).toBeInTheDocument()
  })

  it('is purely presentational: no interactive role', () => {
    const { container } = renderWithProviders(<BotBadge />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('[tabindex], [role]')).toBeNull()
  })
})
