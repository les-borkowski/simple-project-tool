import type { TaskResponse } from '../services/api'

export function taskHref(task: TaskResponse): string {
  return task.story_id
    ? `/stories/${task.story_id}/tasks/${task.id}`
    : `/projects/${task.project_id}/tasks/${task.id}`
}
