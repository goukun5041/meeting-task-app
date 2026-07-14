import type { Issue, IssueHistory, Project } from '../types/issue'

const LEGACY_STORAGE_KEY = 'meeting-task-app:issues'
const STORAGE_KEY = 'meeting-task-app:data'
const STORAGE_VERSION = 2
export const DEFAULT_PROJECT_ID = 'project-default'
export const DEFAULT_PROJECT_NAME = '既存課題'

export interface AppData {
  version: 2
  activeProjectId: string
  projects: Project[]
  issues: Issue[]
}

export function loadAppData(): AppData | null {
  const rawValue = localStorage.getItem(STORAGE_KEY)
  if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue)
      const normalizedData = normalizeAppData(parsed)
      if (normalizedData) return normalizedData
    } catch {
      return null
    }
  }

  return loadLegacyAppData()
}

export function saveAppData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function loadLegacyAppData(): AppData | null {
  const rawValue = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (!rawValue) return null

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return null

    const issues = parsed
      .map((issue) => normalizeIssue(issue, DEFAULT_PROJECT_ID))
      .filter(isIssue)

    if (!issues.length) return null

    const timestamp = getProjectTimestamp(issues)
    return {
      version: STORAGE_VERSION,
      activeProjectId: DEFAULT_PROJECT_ID,
      projects: [
        {
          id: DEFAULT_PROJECT_ID,
          name: DEFAULT_PROJECT_NAME,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      issues,
    }
  } catch {
    return null
  }
}

function normalizeAppData(value: unknown): AppData | null {
  if (!isRecord(value)) return null

  const projects = Array.isArray(value.projects)
    ? value.projects.map(normalizeProject).filter(isProject)
    : []

  if (!projects.length) return null

  const fallbackProjectId = projects[0].id
  const projectIds = new Set(projects.map((project) => project.id))
  const issues = Array.isArray(value.issues)
    ? value.issues
        .map((issue) => normalizeIssue(issue, fallbackProjectId))
        .filter(isIssue)
        .map((issue) =>
          projectIds.has(issue.projectId) ? issue : { ...issue, projectId: fallbackProjectId },
        )
    : []

  const storedActiveProjectId = toStringOrNull(value.activeProjectId)
  const activeProjectId =
    storedActiveProjectId && projectIds.has(storedActiveProjectId)
      ? storedActiveProjectId
      : fallbackProjectId

  return {
    version: STORAGE_VERSION,
    activeProjectId,
    projects,
    issues,
  }
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) return null

  const id = toStringOrNull(value.id)
  const name = toStringOrNull(value.name)
  const createdAt = toStringOrNull(value.createdAt)
  const updatedAt = toStringOrNull(value.updatedAt)

  if (!id || !name || !createdAt || !updatedAt) return null

  return {
    id,
    name,
    createdAt,
    updatedAt,
  }
}

function normalizeIssue(value: unknown, fallbackProjectId: string): Issue | null {
  if (!isRecord(value)) return null

  const id = toStringOrNull(value.id)
  const projectId = toStringOrNull(value.projectId) ?? fallbackProjectId
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

  return {
    id,
    date,
    content,
    createdAt,
    updatedAt,
  }
}

function getProjectTimestamp(issues: Issue[]): string {
  return issues.reduce((oldest, issue) => {
    return issue.createdAt < oldest ? issue.createdAt : oldest
  }, issues[0]?.createdAt ?? new Date().toISOString())
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
