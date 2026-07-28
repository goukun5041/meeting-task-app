import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createProject as apiCreateProject, fetchProjects } from '../api/projectsApi'
import { createTask, deleteTask, fetchTasks, updateTask } from '../api/tasksApi'
import {
  createTaskHistory,
  deleteTaskHistory,
  fetchTaskHistories,
  updateTaskHistory,
} from '../api/taskHistoriesApi'
import { PRIORITY_WEIGHT } from '../constants/issueOptions'
import type {
  Issue,
  IssueFormInput,
  IssueHistoryInput,
  Project,
  ProjectFormInput,
} from '../types/issue'

export const useIssueStore = defineStore('issues', () => {
  const projects = ref<Project[]>([])
  const issues = ref<Issue[]>([])
  const activeProjectId = ref<string | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const errorMessage = ref<string | null>(null)

  const activeProject = computed(() =>
    projects.value.find((project) => project.id === activeProjectId.value) ?? null,
  )

  const projectSelectItems = computed(() =>
    projects.value.map((project) => ({ title: project.name, value: project.id })),
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

  const hasServerData = computed(() => projects.value.length > 0 || issues.value.length > 0)

  async function load(): Promise<void> {
    loading.value = true
    errorMessage.value = null
    try {
      projects.value = await fetchProjects()
      if (!activeProjectId.value || !projects.value.some((project) => project.id === activeProjectId.value)) {
        activeProjectId.value = projects.value[0]?.id ?? null
      }
      await loadIssues()
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      projects.value = []
      issues.value = []
      activeProjectId.value = null
    } finally {
      loading.value = false
    }
  }

  async function loadIssues(): Promise<void> {
    if (!activeProjectId.value) {
      issues.value = []
      return
    }
    issues.value = await fetchTasks({ projectId: activeProjectId.value })
  }

  async function setActiveProject(projectId: string): Promise<void> {
    if (!projects.value.some((project) => project.id === projectId)) return
    activeProjectId.value = projectId
    await loadIssues()
  }

  async function createProject(input: ProjectFormInput): Promise<Project> {
    saving.value = true
    errorMessage.value = null
    try {
      const project = await apiCreateProject(input)
      projects.value = [...projects.value, project]
      activeProjectId.value = project.id
      issues.value = []
      return project
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function createIssue(input: IssueFormInput): Promise<Issue> {
    if (!activeProjectId.value) throw new Error('プロジェクトを作成してください。')
    saving.value = true
    errorMessage.value = null
    try {
      const issue = await createTask({ ...input, projectId: activeProjectId.value })
      issues.value = [issue, ...issues.value]
      return issue
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function updateIssue(id: string, input: IssueFormInput): Promise<void> {
    const currentIssue = getIssueById(id)
    if (!currentIssue) return
    saving.value = true
    errorMessage.value = null
    try {
      const updatedIssue = await updateTask(id, {
        ...input,
        projectId: currentIssue.projectId,
        updatedAt: currentIssue.updatedAt,
      })
      issues.value = issues.value.map((issue) =>
        issue.id === id ? { ...updatedIssue, histories: issue.histories } : issue,
      )
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function deleteIssue(id: string): Promise<void> {
    saving.value = true
    errorMessage.value = null
    try {
      await deleteTask(id)
      issues.value = issues.value.filter((issue) => issue.id !== id)
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function loadIssueHistories(issueId: string): Promise<void> {
    const histories = await fetchTaskHistories(issueId)
    issues.value = issues.value.map((issue) =>
      issue.id === issueId ? { ...issue, histories } : issue,
    )
  }

  async function addIssueHistory(issueId: string, input: IssueHistoryInput): Promise<void> {
    saving.value = true
    errorMessage.value = null
    try {
      const history = await createTaskHistory(issueId, input)
      issues.value = issues.value.map((issue) =>
        issue.id === issueId
          ? { ...issue, histories: [...issue.histories, history], updatedAt: history.updatedAt }
          : issue,
      )
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function updateIssueHistory(issueId: string, historyId: string, input: IssueHistoryInput): Promise<void> {
    const issue = getIssueById(issueId)
    const history = issue?.histories.find((item) => item.id === historyId)
    if (!history) return
    saving.value = true
    errorMessage.value = null
    try {
      const updatedHistory = await updateTaskHistory(issueId, historyId, {
        ...input,
        updatedAt: history.updatedAt,
      })
      issues.value = issues.value.map((item) =>
        item.id === issueId
          ? {
              ...item,
              histories: item.histories.map((historyItem) =>
                historyItem.id === historyId ? updatedHistory : historyItem,
              ),
              updatedAt: updatedHistory.updatedAt,
            }
          : item,
      )
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  async function deleteIssueHistory(issueId: string, historyId: string): Promise<void> {
    saving.value = true
    errorMessage.value = null
    try {
      await deleteTaskHistory(issueId, historyId)
      issues.value = issues.value.map((issue) =>
        issue.id === issueId
          ? { ...issue, histories: issue.histories.filter((history) => history.id !== historyId) }
          : issue,
      )
    } catch (error) {
      errorMessage.value = toUserMessage(error)
      throw error
    } finally {
      saving.value = false
    }
  }

  function getIssueById(id: string): Issue | undefined {
    return issues.value.find((issue) => issue.id === id)
  }

  function toUserMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      if (error.message.includes('conflict') || error.message.includes('updated by another')) {
        return '別の画面で更新されています。再読み込みしてください。'
      }
      return error.message
    }
    return '通信に失敗しました。'
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
    loading,
    saving,
    errorMessage,
    hasServerData,
    load,
    loadIssues,
    setActiveProject,
    createProject,
    createIssue,
    updateIssue,
    deleteIssue,
    loadIssueHistories,
    addIssueHistory,
    updateIssueHistory,
    deleteIssueHistory,
    getIssueById,
  }
})
