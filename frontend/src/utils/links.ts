import type { TaskResponse, RecentItemResponse } from '../services/api'

export function taskHref(task: TaskResponse): string {
  return task.story_id
    ? `/stories/${task.story_id}/tasks/${task.id}`
    : `/projects/${task.project_id}/tasks/${task.id}`
}

export function recentLink(item: RecentItemResponse): string {
  if (item.type === 'project') return `/projects/${item.id}`
  if (item.type === 'story') return `/projects/${item.project_id}/stories/${item.id}`
  if (item.story_id) return `/stories/${item.story_id}/tasks/${item.id}`
  return `/projects/${item.project_id}/tasks/${item.id}`
}
