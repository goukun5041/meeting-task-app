import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { PRIORITY_WEIGHT } from '../constants/issueOptions'
import type {
  Issue,
  IssueFormInput,
  IssueHistory,
  IssueHistoryInput,
  Project,
  ProjectFormInput,
} from '../types/issue'
import {
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_NAME,
  type AppData,
  loadAppData,
  saveAppData,
} from '../utils/storage'

const now = new Date()
const today = now.toISOString().slice(0, 10)
const nextWeek = new Date(now)
nextWeek.setDate(now.getDate() + 7)

const sampleProject: Project = {
  id: DEFAULT_PROJECT_ID,
  name: DEFAULT_PROJECT_NAME,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
}

const sampleIssues: Issue[] = [
  {
    id: 'issue-001',
    projectId: DEFAULT_PROJECT_ID,
    title: '議事録テンプレートを整理する',
    description: '定例会で使う議事録テンプレートの項目を見直す。',
    status: '対応中',
    priority: '高',
    dueDate: nextWeek.toISOString().slice(0, 10),
    histories: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 'issue-002',
    projectId: DEFAULT_PROJECT_ID,
    title: 'タスク棚卸しの確認',
    description: '未着手の課題を確認し、優先度を調整する。',
    status: '未着手',
    priority: '中',
    dueDate: today,
    histories: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 'issue-003',
    projectId: DEFAULT_PROJECT_ID,
    title: '完了済み課題のレビュー',
    description: '',
    status: '完了',
    priority: '低',
    dueDate: null,
    histories: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
]

function createIssueId(): string {
  return createPrefixedId('issue')
}

function createHistoryId(): string {
  return createPrefixedId('history')
}

function createProjectId(): string {
  return createPrefixedId('project')
}

function createPrefixedId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}`
}

export const useIssueStore = defineStore('issues', () => {
  const projects = ref<Project[]>([])
  const issues = ref<Issue[]>([])
  const activeProjectId = ref<string | null>(null)

  const activeProject = computed(() =>
    projects.value.find((project) => project.id === activeProjectId.value) ?? null,
  )

  const projectSelectItems = computed(() =>
    projects.value.map((project) => ({
      title: project.name,
      value: project.id,
    })),
  )

  const projectIssues = computed(() =>
    activeProjectId.value
      ? issues.value.filter((issue) => issue.projectId === activeProjectId.value)
      : [],
  )

  const sortedIssues = computed(() =>
    [...projectIssues.value].sort((a, b) => {
      if (a.status === '完了' && b.status !== '完了') return 1
      if (a.status !== '完了' && b.status === '完了') return -1

      const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      if (priorityDiff !== 0) return priorityDiff

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }),
  )

  const summary = computed(() => ({
    total: projectIssues.value.length,
    active: projectIssues.value.filter((issue) => issue.status !== '完了').length,
    done: projectIssues.value.filter((issue) => issue.status === '完了').length,
    urgent: projectIssues.value.filter((issue) => issue.priority === '緊急').length,
  }))

  function persist(): void {
    saveAppData(toAppData())
  }

  function load(): void {
    const storedData = loadAppData()
    if (storedData) {
      projects.value = storedData.projects
      issues.value = storedData.issues
      activeProjectId.value = storedData.activeProjectId
      persist()
      return
    }

    projects.value = [sampleProject]
    issues.value = sampleIssues
    activeProjectId.value = sampleProject.id
    persist()
  }

  function setActiveProject(projectId: string): void {
    if (!projects.value.some((project) => project.id === projectId)) return

    activeProjectId.value = projectId
    persist()
  }

  function createProject(input: ProjectFormInput): Project {
    const timestamp = new Date().toISOString()
    const project: Project = {
      id: createProjectId(),
      name: input.name.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    projects.value = [...projects.value, project]
    activeProjectId.value = project.id
    persist()
    return project
  }

  function createIssue(input: IssueFormInput): Issue {
    const timestamp = new Date().toISOString()
    const issue: Issue = {
      ...input,
      id: createIssueId(),
      projectId: activeProjectId.value ?? ensureActiveProject().id,
      histories: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    issues.value = [issue, ...issues.value]
    persist()
    return issue
  }

  function updateIssue(id: string, input: IssueFormInput): void {
    const timestamp = new Date().toISOString()
    issues.value = issues.value.map((issue) =>
      issue.id === id
        ? {
            ...issue,
            ...input,
            updatedAt: timestamp,
          }
        : issue,
    )
    persist()
  }

  function deleteIssue(id: string): void {
    issues.value = issues.value.filter((issue) => issue.id !== id)
    persist()
  }

  function addIssueHistory(issueId: string, input: IssueHistoryInput): void {
    const timestamp = new Date().toISOString()
    const history: IssueHistory = {
      ...input,
      id: createHistoryId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    issues.value = issues.value.map((issue) =>
      issue.id === issueId
        ? {
            ...issue,
            histories: [...issue.histories, history],
            updatedAt: timestamp,
          }
        : issue,
    )
    persist()
  }

  function updateIssueHistory(
    issueId: string,
    historyId: string,
    input: IssueHistoryInput,
  ): void {
    const timestamp = new Date().toISOString()
    issues.value = issues.value.map((issue) =>
      issue.id === issueId
        ? {
            ...issue,
            histories: issue.histories.map((history) =>
              history.id === historyId
                ? {
                    ...history,
                    ...input,
                    updatedAt: timestamp,
                  }
                : history,
            ),
            updatedAt: timestamp,
          }
        : issue,
    )
    persist()
  }

  function deleteIssueHistory(issueId: string, historyId: string): void {
    const timestamp = new Date().toISOString()
    issues.value = issues.value.map((issue) =>
      issue.id === issueId
        ? {
            ...issue,
            histories: issue.histories.filter((history) => history.id !== historyId),
            updatedAt: timestamp,
          }
        : issue,
    )
    persist()
  }

  function getIssueById(id: string): Issue | undefined {
    return issues.value.find((issue) => issue.id === id)
  }

  function ensureActiveProject(): Project {
    if (activeProject.value) return activeProject.value

    const fallbackProject = projects.value[0] ?? sampleProject
    if (!projects.value.length) {
      projects.value = [fallbackProject]
    }
    activeProjectId.value = fallbackProject.id
    return fallbackProject
  }

  function toAppData(): AppData {
    const activeProject = ensureActiveProject()

    return {
      version: 2,
      activeProjectId: activeProject.id,
      projects: projects.value,
      issues: issues.value,
    }
  }

  return {
    projects,
    issues,
    activeProjectId,
    activeProject,
    projectSelectItems,
    projectIssues,
    sortedIssues,
    summary,
    load,
    setActiveProject,
    createProject,
    createIssue,
    updateIssue,
    deleteIssue,
    addIssueHistory,
    updateIssueHistory,
    deleteIssueHistory,
    getIssueById,
  }
})
