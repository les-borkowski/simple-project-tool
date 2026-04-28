import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { commentsApi } from '../../services/api'
import type { CommentResponse } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { EmptyState } from '../common/EmptyState'
import { formatDate } from '../../utils/format'
import i18n from '../../i18n'

type ItemType = 'project' | 'story' | 'task'

interface Props {
  itemType: ItemType
  itemId: string
}

export function CommentList({ itemType, itemId }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [comments, setComments] = useState<CommentResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [newBody, setNewBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  const load = async () => {
    try {
      let res
      if (itemType === 'project') res = await commentsApi.listForProject(itemId)
      else if (itemType === 'story') res = await commentsApi.listForStory(itemId)
      else res = await commentsApi.listForTask(itemId)
      setComments(res.data.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [itemId, itemType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBody.trim()) return
    setSubmitting(true)
    try {
      let res
      if (itemType === 'project') res = await commentsApi.createForProject(itemId, newBody)
      else if (itemType === 'story') res = await commentsApi.createForStory(itemId, newBody)
      else res = await commentsApi.createForTask(itemId, newBody)
      setComments((prev) => [...prev, res.data])
      setNewBody('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async (id: string) => {
    await commentsApi.update(id, editBody)
    setComments((prev) => prev.map((c) => c.id === id ? { ...c, body: editBody } : c))
    setEditId(null)
  }

  const handleDelete = async (id: string) => {
    await commentsApi.delete(id)
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  if (loading) return <div className="animate-pulse h-10 bg-gray-100 dark:bg-gray-700 rounded" />

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <EmptyState message={t('comments.empty')} />
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{c.author_name}</span>
                <span className="text-xs text-gray-400">{formatDate(c.created_at, i18n.language)}</span>
              </div>
              {editId === c.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(c.id)} className="px-3 py-1 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded">{t('actions.save')}</button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded">{t('actions.cancel')}</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 dark:text-gray-300">{c.body}</p>
              )}
              {(c.author_id === user?.id || user?.role === 'manager') && editId !== c.id && (
                <div className="flex gap-3 mt-2">
                  {c.author_id === user?.id && (
                    <button onClick={() => { setEditId(c.id); setEditBody(c.body) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{t('actions.edit')}</button>
                  )}
                  <button onClick={() => handleDelete(c.id)} className="text-xs text-red-400 hover:text-red-600">{t('actions.delete')}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Comment form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder={t('comments.placeholder')}
          rows={2}
          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button
          type="submit"
          disabled={submitting || !newBody.trim()}
          className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-md disabled:opacity-50"
        >
          {t('comments.submit')}
        </button>
      </form>
    </div>
  )
}
