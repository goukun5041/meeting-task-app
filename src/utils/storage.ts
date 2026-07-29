import type { Issue, IssueHistory, Project } from '../types/issue'

export const APP_DATA_STORAGE_KEY = 'meeting-task-app:data'
const BACKUP_PREFIX = 'meeting-task-app:data:backup:'

export interface AppData {
  version: 2
  activeProjectId: string
  projects: Project[]
  issues: Issue[]
}

export function loadLocalAppData(): AppData | null {
  const rawValue = localStorage.getItem(APP_DATA_STORAGE_KEY)
  if (!rawValue) return null

  try {
    const parsed = JSON.parse(rawValue)
    return normalizeAppData(parsed)
  } catch {
    return null
  }
}

export function hasLocalAppData(): boolean {
  return loadLocalAppData() !== null
}

export function backupAndClearLocalAppData(now = new Date()): string | null {
  const rawValue = localStorage.getItem(APP_DATA_STORAGE_KEY)
  if (!rawValue) return null

  const timestamp = now.toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, '')
  const backupKey = `${BACKUP_PREFIX}${timestamp}`
  localStorage.setItem(backupKey, rawValue)
  localStorage.removeItem(APP_DATA_STORAGE_KEY)
  return backupKey
}

function normalizeAppData(value: unknown): AppData | null {
  if (!isRecord(value) || value.version !== 2) return null

  const activeProjectId = toStringOrNull(value.activeProjectId)
  const projects = Array.isArray(value.projects)
    ? value.projects.map(normalizeProject).filter(isProject)
    : []
  const projectIds = new Set(projects.map((project) => project.id))
  const issues = Array.isArray(value.issues)
    ? value.issues.map(normalizeIssue).filter(isIssue)
    : []

  if (!activeProjectId || !projects.length || !projectIds.has(activeProjectId)) return null
  if (issues.some((issue) => !projectIds.has(issue.projectId))) return null

  return { version: 2, activeProjectId, projects, issues }
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) return null
  const id = toStringOrNull(value.id)
  const name = toStringOrNull(value.name)
  const createdAt = toStringOrNull(value.createdAt)
  const updatedAt = toStringOrNull(value.updatedAt)
  if (!id || !name || !createdAt || !updatedAt) return null
  return { id, name, createdAt, updatedAt }
}

function normalizeIssue(value: unknown): Issue | null {
  if (!isRecord(value)) return null
  const id = toStringOrNull(value.id)
  const projectId = toStringOrNull(value.projectId)
  const title = toStringOrNull(value.title)
  const description = typeof value.description === 'string' ? value.description : ''
  const status = toStringOrNull(value.status)
  const priority = toStringOrNull(value.priority)
  const createdAt = toStringOrNull(value.createdAt)
  const updatedAt = toStringOrNull(value.updatedAt)
  if (!id || !projectId || !title || !status || !priority || !createdAt || !updatedAt) return null

  return {
    id,
    projectId,
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
  return { id, date, content, createdAt, updatedAt }
}

function isProject(value: Project | null): value is Project {
  return value !== null
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
