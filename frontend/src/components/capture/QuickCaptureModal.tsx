import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import axios from 'axios'
import { captureApi, isDemoBlockedError, projectsApi } from '../../services/api'
import type { CapturePreviewTask, MemberResponse, Priority, TaskResponse } from '../../services/api'
import { useStories } from '../../hooks/useStories'
import { getApiErrorCode, getApiErrorMessage } from '../../utils/errors'
import { Modal } from '../common/Modal'

interface QuickCaptureModalProps {
  projectId: string
  onCreated: (tasks: TaskResponse[]) => void
  onClose: () => void
}

// A task under review, editable in place before confirmation. Mutable copies
// of the server-suggested fields, plus the local checked flag the confirm
// step reads from.
interface DraftTask {
  checked: boolean
  title: string
  description: string
  due_date: string
  assignee_id: string
  story_id: string
  priority: Priority | ''
  low_confidence: boolean
}

const priorities: Priority[] = ['low', 'medium', 'high']

// `toISOString()` reports UTC, which drifts a day from the user's local date
// near midnight; the capture endpoint wants the date as the user sees it.
function todayLocalISODate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Null when nothing should be shown — a demo block already raises a global toast. */
function captureErrorMessage(err: unknown, t: TFunction): string | null {
  if (isDemoBlockedError(err)) return null

  const code = getApiErrorCode(err)

  // The backend distinguishes these deliberately, and the difference is the whole
  // message: "not configured" and "your key was rejected" never resolve by waiting,
  // so telling the user to try again later leaves them waiting forever.
  if (code === 'LLM_NOT_CONFIGURED') return t('capture.not_configured')
  if (code === 'LLM_KEY_INVALID') return t('capture.key_invalid')
  if (code === 'LLM_RATE_LIMITED' || code === 'DEMO_CAPTURE_COOLDOWN') {
    const retryAfter = axios.isAxiosError(err)
      ? Number(err.response?.headers?.['retry-after'])
      : NaN
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? t('capture.rate_limited_retry', { seconds: Math.ceil(retryAfter) })
      : (getApiErrorMessage(err) ?? t('capture.rate_limited'))
  }
  if (code === 'LLM_UNAVAILABLE') return t('capture.unavailable')

  // A 503 with no recognised code is still an outage.
  if (axios.isAxiosError(err) && err.response?.status === 503) return t('capture.unavailable')

  return getApiErrorMessage(err) ?? t('errors.generic')
}

function toDraft(task: CapturePreviewTask): DraftTask {
  return {
    checked: !task.low_confidence,
    title: task.title,
    description: task.description ?? '',
    due_date: task.due_date ?? '',
    assignee_id: task.assignee_id ?? '',
    story_id: task.story_id ?? '',
    priority: task.priority ?? '',
    low_confidence: task.low_confidence,
  }
}

// Mirrors CaptureRequest.text's max_length on the backend — the server rejects
// anything longer with a 422, so stop it at the field rather than round-tripping.
const CAPTURE_MAX_LENGTH = 4000

export function QuickCaptureModal({ projectId, onCreated, onClose }: QuickCaptureModalProps) {
  const { t } = useTranslation()
  const storiesHook = useStories(projectId)

  const [members, setMembers] = useState<MemberResponse[]>([])
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<DraftTask[] | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    projectsApi.listMembers(projectId).then((res) => setMembers(res.data)).catch(() => {})
  }, [projectId])

  const step: 'input' | 'review' = drafts === null ? 'input' : 'review'

  const updateDraft = (index: number, patch: Partial<DraftTask>) => {
    setDrafts((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  const handlePreview = async () => {
    if (!text.trim() || pending) return
    setPending(true)
    setError(null)
    setWarnings([])
    try {
      const res = await captureApi.preview(projectId, text, todayLocalISODate())
      if (res.data.tasks.length === 0) {
        setWarnings(res.data.warnings)
        return
      }
      setWarnings(res.data.warnings)
      setDrafts(res.data.tasks.map(toDraft))
    } catch (err) {
      setError(captureErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  const handleConfirm = async () => {
    if (!drafts || pending) return
    const checked = drafts.filter((d) => d.checked)
    if (checked.length === 0) return
    if (checked.some((d) => !d.title.trim())) {
      setError(t('capture.title_required'))
      return
    }
    setPending(true)
    setError(null)
    try {
      const items = checked.map((d) => ({
        title: d.title,
        description: d.description || null,
        story_id: d.story_id || null,
        assignee_id: d.assignee_id || null,
        due_date: d.due_date || null,
        priority: d.priority || null,
      }))
      const res = await captureApi.confirm(projectId, items)
      onCreated(res.data.created)
    } catch (err) {
      setError(captureErrorMessage(err, t))
    } finally {
      setPending(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 'input') {
      handlePreview()
    } else {
      handleConfirm()
    }
  }

  const checkedCount = drafts?.filter((d) => d.checked).length ?? 0

  return (
    <Modal
      open
      onClose={onClose}
      title={t('capture.title')}
      size="lg"
      onSubmit={handleSubmit}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-ui-md border border-stone-200 dark:border-stone-700 rounded-md text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 tap-safe"
          >
            {t('actions.cancel')}
          </button>
          {step === 'input' ? (
            <button
              type="submit"
              disabled={!text.trim() || pending}
              className="px-3 py-1.5 text-ui-md accent-bg rounded-md disabled:opacity-50 tap-safe"
            >
              {pending ? `${t('capture.extract')}…` : t('capture.extract')}
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending || checkedCount === 0}
              className="px-3 py-1.5 text-ui-md accent-bg rounded-md disabled:opacity-50 tap-safe"
            >
              {pending ? `${t('actions.create')}…` : t('actions.create')}
            </button>
          )}
        </div>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-4 px-3 py-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-ui-sm text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mb-4 px-3 py-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 text-ui-sm text-amber-800 dark:text-amber-300 space-y-1">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {step === 'input' ? (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CAPTURE_MAX_LENGTH))}
            placeholder={t('capture.placeholder')}
            rows={5}
            maxLength={CAPTURE_MAX_LENGTH}
            aria-describedby="capture-length"
            className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
          />
          <p
            id="capture-length"
            aria-live="polite"
            className={`mt-1 text-right text-ui-xs tabular-nums ${
              text.length >= CAPTURE_MAX_LENGTH
                ? 'text-red-600 dark:text-red-400'
                : 'text-stone-400 dark:text-stone-500'
            }`}
          >
            {text.length} / {CAPTURE_MAX_LENGTH}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts!.map((draft, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 p-3 rounded-md border border-stone-200 dark:border-stone-700"
            >
              <div className="flex items-start gap-2">
                <label className="flex items-center justify-center tap-safe cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={draft.checked}
                    onChange={(e) => updateDraft(i, { checked: e.target.checked })}
                    className="h-5 w-5 rounded"
                    aria-label={draft.title}
                  />
                </label>
                <div className="flex-1 space-y-1">
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => updateDraft(i, { title: e.target.value })}
                    placeholder={t('board.col_title')}
                    required
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
                  />
                  {draft.low_confidence && (
                    <span className="inline-block text-ui-sm text-amber-600 dark:text-amber-400">
                      {t('capture.low_confidence')}
                    </span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor={`qcm-description-${i}`} className="text-ui-sm font-medium text-stone-500">
                  {t('tasks.description')}
                </label>
                <textarea
                  id={`qcm-description-${i}`}
                  value={draft.description}
                  onChange={(e) => updateDraft(i, { description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md focus-ring"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor={`qcm-due-${i}`} className="text-ui-sm font-medium text-stone-500">
                    {t('capture.due_date')}
                  </label>
                  <input
                    id={`qcm-due-${i}`}
                    type="date"
                    value={draft.due_date}
                    onChange={(e) => updateDraft(i, { due_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`qcm-priority-${i}`} className="text-ui-sm font-medium text-stone-500">
                    {t('filter.priority')}
                  </label>
                  <select
                    id={`qcm-priority-${i}`}
                    value={draft.priority}
                    onChange={(e) => updateDraft(i, { priority: e.target.value as Priority | '' })}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
                  >
                    <option value="">{t('capture.no_priority')}</option>
                    {priorities.map((p) => (
                      <option key={p} value={p}>{t(`priority.${p}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor={`qcm-assignee-${i}`} className="text-ui-sm font-medium text-stone-500">
                    {t('tasks.assignee')}
                  </label>
                  <select
                    id={`qcm-assignee-${i}`}
                    value={draft.assignee_id}
                    onChange={(e) => updateDraft(i, { assignee_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
                  >
                    <option value="">{t('tasks.unassigned')}</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor={`qcm-story-${i}`} className="text-ui-sm font-medium text-stone-500">
                    {t('tasks.story')}
                  </label>
                  <select
                    id={`qcm-story-${i}`}
                    value={draft.story_id}
                    onChange={(e) => updateDraft(i, { story_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-950 text-ui-md"
                  >
                    {/* The extractor leaves story_id empty whenever the text names no
                        story, which is most of the time. Without an option whose value
                        is '' the select matches nothing and paints blank, so the user
                        cannot see where the task is going — it goes to Backlog, which
                        is what this option says. */}
                    <option value="">{t('capture.no_story')}</option>
                    {[...storiesHook.items]
                      .sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1))
                      .map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
          {checkedCount === 0 && (
            <p className="text-ui-sm text-stone-500">{t('capture.no_tasks_selected')}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
