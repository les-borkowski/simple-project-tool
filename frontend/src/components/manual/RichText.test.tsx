import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RichText } from './RichText'

describe('RichText', () => {
  it('renders bold', () => {
    render(<RichText text="choose **Register** now" />)
    expect(screen.getByText('Register').tagName).toBe('STRONG')
  })

  it('renders italics', () => {
    render(<RichText text="shows _No results_ instead" />)
    expect(screen.getByText('No results').tagName).toBe('EM')
  })

  it('renders inline code', () => {
    render(<RichText text="run `uv sync` first" />)
    expect(screen.getByText('uv sync').tagName).toBe('CODE')
  })

  it('renders keyboard keys', () => {
    render(<RichText text="press [[⌘K]] anywhere" />)
    expect(screen.getByText('⌘K').tagName).toBe('KBD')
  })

  it('renders an in-page anchor without opening a new tab', () => {
    render(<RichText text="see [Members](#members) for detail" />)
    const link = screen.getByRole('link', { name: 'Members' })
    expect(link).toHaveAttribute('href', '#members')
    expect(link).not.toHaveAttribute('target')
  })

  it('opens an external link away from the app', () => {
    render(<RichText text="install [uv](https://docs.astral.sh/uv/) first" />)
    const link = screen.getByRole('link', { name: 'uv' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('keeps surrounding text intact', () => {
    const { container } = render(<RichText text="a **b** c _d_ e" />)
    expect(container.textContent).toBe('a b c d e')
  })

  it('leaves an unmatched delimiter as literal text rather than swallowing it', () => {
    // A translator writing an apostrophe or a stray underscore must see it rendered.
    const { container } = render(<RichText text="5 * 3 and snake_case and 100%" />)
    expect(container.textContent).toBe('5 * 3 and snake_case and 100%')
  })

  it('does not treat a kbd as a link', () => {
    render(<RichText text="[[Esc]] closes it" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Esc').tagName).toBe('KBD')
  })

  it('renders plain text unchanged', () => {
    const { container } = render(<RichText text="nothing special here" />)
    expect(container.textContent).toBe('nothing special here')
  })
})
