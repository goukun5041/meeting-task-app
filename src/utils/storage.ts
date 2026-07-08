import type { Issue } from '../types/issue'

const STORAGE_KEY = 'meeting-task-app:issues'

export function loadIssues(): Issue[] | null {
  const rawValue = localStorage.getItem(STORAGE_KEY)
  if (!rawValue) return null

  try {
    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? (parsed as Issue[]) : null
  } catch {
    return null
  }
}

export function saveIssues(issues: Issue[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(issues))
}
