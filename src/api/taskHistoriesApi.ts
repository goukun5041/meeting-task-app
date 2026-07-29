import type { IssueHistory, IssueHistoryInput } from '../types/issue'
import { apiRequest } from './httpClient'

export async function fetchTaskHistories(taskId: string): Promise<IssueHistory[]> {
  const response = await apiRequest<{ histories: IssueHistory[] }>(
    `/api/tasks/${encodeURIComponent(taskId)}/histories`,
  )
  return response.histories
}

export async function createTaskHistory(taskId: string, input: IssueHistoryInput): Promise<IssueHistory> {
  const response = await apiRequest<{ history: IssueHistory }>(
    `/api/tasks/${encodeURIComponent(taskId)}/histories`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return response.history
}

export async function updateTaskHistory(
  taskId: string,
  historyId: string,
  input: IssueHistoryInput & { updatedAt: string },
): Promise<IssueHistory> {
  const response = await apiRequest<{ history: IssueHistory }>(
    `/api/tasks/${encodeURIComponent(taskId)}/histories/${encodeURIComponent(historyId)}`,
    { method: 'PUT', body: JSON.stringify(input) },
  )
  return response.history
}

export async function deleteTaskHistory(taskId: string, historyId: string): Promise<void> {
  await apiRequest<void>(
    `/api/tasks/${encodeURIComponent(taskId)}/histories/${encodeURIComponent(historyId)}`,
    { method: 'DELETE' },
  )
}
