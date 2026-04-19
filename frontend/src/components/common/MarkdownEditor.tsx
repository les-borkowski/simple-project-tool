import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  autoExpand?: boolean
}

type WrapConfig = { before: string; after: string; placeholder: string }

export function MarkdownEditor({ value, onChange, rows = 4, placeholder = 'Add description…', autoExpand = false }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!autoExpand || !ref.current) return
    const ta = ref.current
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [value, autoExpand])

  const wrap = ({ before, after, placeholder: ph }: WrapConfig) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.slice(start, end) || ph
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(next)
    // Restore cursor after state update
    requestAnimationFrame(() => {
      ta.focus()
      const cursorStart = start + before.length
      const cursorEnd = cursorStart + selected.length
      ta.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  const insertLine = (prefix: string) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length)
    })
  }

  const btnClass =
    'px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1 px-1 py-1 rounded-t border border-b-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-750">
        <button type="button" className={btnClass} title="Bold" onClick={() => wrap({ before: '**', after: '**', placeholder: 'bold' })}>
          <strong>B</strong>
        </button>
        <button type="button" className={btnClass} title="Italic" onClick={() => wrap({ before: '*', after: '*', placeholder: 'italic' })}>
          <em>I</em>
        </button>
        <button type="button" className={btnClass} title="Code" onClick={() => wrap({ before: '`', after: '`', placeholder: 'code' })}>
          {'</>'}
        </button>
        <button type="button" className={btnClass} title="Link" onClick={() => wrap({ before: '[', after: '](url)', placeholder: 'link text' })}>
          Link
        </button>
        <span className="w-px bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <button type="button" className={btnClass} title="Bullet list" onClick={() => insertLine('- ')}>
          • List
        </button>
        <button type="button" className={btnClass} title="Numbered list" onClick={() => insertLine('1. ')}>
          1. List
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        style={autoExpand ? { overflow: 'hidden', maxHeight: 'calc(100vh - 240px)' } : undefined}
        className="w-full px-3 py-2 rounded-b border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
      />
    </div>
  )
}
