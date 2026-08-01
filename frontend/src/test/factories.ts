import type {
  UserResponse,
  ProjectResponse,
  StoryResponse,
  TaskResponse,
  ProjectStatusResponse,
  TimelineTask,
} from '../services/api'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

export function makeUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: nextId('user'),
    email: 'user@example.com',
    name: 'Test User',
    role: 'manager',
    is_demo: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function makeProject(overrides: Partial<ProjectResponse> = {}): ProjectResponse {
  return {
    id: nextId('project'),
    name: 'Test Project',
    description: null,
    owner_id: nextId('user'),
    status: 'active',
    priority: 'medium',
    archived_at: null,
    created_by: nextId('user'),
    created_at: new Date().toISOString(),
    effort_unit: null,
    ...overrides,
  }
}

export function makeStory(overrides: Partial<StoryResponse> = {}): StoryResponse {
  return {
    id: nextId('story'),
    project_id: nextId('project'),
    is_default: false,
    title: 'Test Story',
    description: null,
    status: 'todo',
    priority: 'medium',
    created_by: nextId('user'),
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function makeTask(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: nextId('task'),
    project_id: nextId('project'),
    story_id: null,
    title: 'Test Task',
    description: null,
    status: 'todo',
    priority: 'medium',
    assignee_id: null,
    sprint_id: null,
    effort: null,
    position: 0,
    due_date: null,
    created_by: nextId('user'),
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function makeProjectStatus(
  overrides: Partial<ProjectStatusResponse> = {}
): ProjectStatusResponse {
  return {
    id: nextId('status'),
    project_id: nextId('project'),
    slug: 'todo',
    name: 'To Do',
    colour: '#000000',
    order: 0,
    ...overrides,
  }
}

export function makeTimelineTask(overrides: Partial<TimelineTask> = {}): TimelineTask {
  return {
    task_id: nextId('task'),
    title: 'Test Task',
    status: 'todo',
    priority: 'medium',
    story_id: null,
    sprint_id: null,
    bar_start: '2026-07-01',
    bar_end: '2026-07-05',
    source: 'deadline',
    ...overrides,
  }
}
