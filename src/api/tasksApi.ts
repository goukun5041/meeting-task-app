import type { Issue, IssueFormInput } from '../types/issue'
import { apiRequest } from './httpClient'

export interface TaskListParams {
  projectId?: string
  status?: string | null
  priority?: string | null
  keyword?: string
}

export async function fetchTasks(params: TaskListParams = {}): Promise<Issue[]> {
  const search = new URLSearchParams()
  if (params.projectId) search.set('projectId', params.projectId)
  if (params.status) search.set('status', params.status)
  if (params.priority) search.set('priority', params.priority)
  if (params.keyword) search.set('keyword', params.keyword)
  const query = search.toString()
  const response = await apiRequest<{ tasks: Issue[] }>(`/api/tasks${query ? `?${query}` : ''}`)
  return response.tasks
}

export async function fetchTask(id: string): Promise<Issue> {
  const response = await apiRequest<{ task: Issue }>(`/api/tasks/${encodeURIComponent(id)}`)
  return response.task
}

export async function createTask(input: IssueFormInput & { projectId: string }): Promise<Issue> {
  const response = await apiRequest<{ task: Issue }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.task
}

export async function updateTask(id: string, input: IssueFormInput & { projectId: string; updatedAt: string }): Promise<Issue> {
  const response = await apiRequest<{ task: Issue }>(`/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return response.task
}

export async function deleteTask(id: string): Promise<void> {
  await apiRequest<void>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
