import type { Issue, IssueHistory } from '../types/issue'

const STORAGE_KEY = 'meeting-task-app:issues'

export function loadIssues(): Issue[] | null {
  const rawValue = localStorage.getItem(STORAGE_KEY)
  if (!rawValue) return null

  try {
    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? parsed.map(normalizeIssue).filter(isIssue) : null
  } catch {
    return null
  }
}

export function saveIssues(issues: Issue[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues))
}

function normalizeIssue(value: unknown): Issue | null {
  if (!isRecord(value)) return null

  const id = toStringOrNull(value.id)
  const title = toStringOrNull(value.title)
  const description = typeof value.description === 'string' ? value.description : ''
  const status = toStringOrNull(value.status)
  const priority = toStringOrNull(value.priority)
  const createdAt = toStringOrNull(value.createdAt)
  const updatedAt = toStringOrNull(value.updatedAt)

  if (!id || !title || !status || !priority || !createdAt || !updatedAt) return null

  return {
    id,
    title,
    description,
    status: status as Issue['status'],
    priority: priority as Issue['priority'],
    dueDate: typeof value.dueDate === 'string' ? value.dueDate : null,
    histories: Array.isArray(value.histories)
      ? value.histories.map(normalizeHistory).filter(isIssueHistory)
      : [],
    createdAt,
    updatedAt,
  }
}

function normalizeHistory(value: unknown): IssueHistory | null {
  if (!isRecord(value)) return null

  const id = toStringOrNull(value.id)
  const date = toStringOrNull(value.date)
  const content = toStringOrNull(value.content)
  const createdAt = toStringOrNull(value.createdAt)
  const updatedAt = toStringOrNull(value.updatedAt)

  if (!id || !date || !content || !createdAt || !updatedAt) return null

  return {
    id,
    date,
    content,
    createdAt,
    updatedAt,
  }
}

function isIssue(value: Issue | null): value is Issue {
  return value !== null
}

function isIssueHistory(value: IssueHistory | null): value is IssueHistory {
  return value !== null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
