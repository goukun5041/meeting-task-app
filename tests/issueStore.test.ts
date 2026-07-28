import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  createProject: vi.fn(),
  fetchTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  fetchTaskHistories: vi.fn(),
  createTaskHistory: vi.fn(),
  updateTaskHistory: vi.fn(),
  deleteTaskHistory: vi.fn(),
}))

vi.mock('../src/api/projectsApi', () => ({
  fetchProjects: mocks.fetchProjects,
  createProject: mocks.createProject,
}))

vi.mock('../src/api/tasksApi', () => ({
  fetchTasks: mocks.fetchTasks,
  createTask: mocks.createTask,
  updateTask: mocks.updateTask,
  deleteTask: mocks.deleteTask,
}))

vi.mock('../src/api/taskHistoriesApi', () => ({
  fetchTaskHistories: mocks.fetchTaskHistories,
  createTaskHistory: mocks.createTaskHistory,
  updateTaskHistory: mocks.updateTaskHistory,
  deleteTaskHistory: mocks.deleteTaskHistory,
}))

import { useIssueStore } from '../src/stores/issueStore'

const project = {
  id: 'project-1',
  name: 'Project',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
}

const issue = {
  id: 'issue-1',
  projectId: project.id,
  title: 'Issue',
  description: '',
  status: '未着手' as const,
  priority: '中' as const,
  dueDate: null,
  histories: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-02T00:00:00.000Z',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mocks.fetchProjects.mockResolvedValue([project])
  mocks.fetchTasks.mockResolvedValue([issue])
})

describe('issueStore account isolation', () => {
  it('clears state and ignores an in-flight load after reset', async () => {
    let resolveProjects!: (value: (typeof project)[]) => void
    mocks.fetchProjects.mockReturnValue(new Promise((resolve) => {
      resolveProjects = resolve
    }))

    const store = useIssueStore()
    const loading = store.load()
    store.reset()
    resolveProjects([project])
    await loading

    expect(store.projects).toEqual([])
    expect(store.issues).toEqual([])
    expect(store.activeProjectId).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('ignores an in-flight mutation after reset', async () => {
    const store = useIssueStore()
    await store.load()

    let resolveCreate!: (value: typeof issue) => void
    mocks.createTask.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve
    }))

    const creating = store.createIssue({
      title: 'Pending',
      description: '',
      status: '未着手',
      priority: '中',
      dueDate: null,
    })
    store.reset()
    resolveCreate(issue)
    await creating

    expect(store.projects).toEqual([])
    expect(store.issues).toEqual([])
    expect(store.saving).toBe(false)
  })
})

describe('issueStore optimistic locking', () => {
  it('does not let a stale project request overwrite the active project issues', async () => {
    const secondProject = { ...project, id: 'project-2', name: 'Project 2' }
    const secondIssue = { ...issue, id: 'issue-2', projectId: secondProject.id }
    mocks.fetchProjects.mockResolvedValue([project, secondProject])
    const store = useIssueStore()
    await store.load()

    let resolveFirstProject!: (value: typeof issue[]) => void
    let resolveSecondProject!: (value: typeof issue[]) => void
    mocks.fetchTasks.mockImplementation(({ projectId }: { projectId: string }) =>
      new Promise((resolve) => {
        if (projectId === project.id) resolveFirstProject = resolve
        else resolveSecondProject = resolve
      }),
    )

    const staleRequest = store.setActiveProject(secondProject.id)
    const currentRequest = store.setActiveProject(project.id)
    resolveFirstProject([issue])
    await currentRequest
    resolveSecondProject([secondIssue])
    await staleRequest

    expect(store.activeProjectId).toBe(project.id)
    expect(store.issues.map((item) => item.id)).toEqual([issue.id])
  })

  it('ignores an error from a stale project request', async () => {
    const secondProject = { ...project, id: 'project-2', name: 'Project 2' }
    const secondIssue = { ...issue, id: 'issue-2', projectId: secondProject.id, title: 'Second' }
    mocks.fetchProjects.mockResolvedValue([project, secondProject])
    mocks.fetchTasks.mockResolvedValueOnce([issue])

    const store = useIssueStore()
    await store.load()

    let rejectFirstProject!: (reason: Error) => void
    const staleRequest = new Promise<(typeof issue)[]>((_, reject) => {
      rejectFirstProject = reject
    })
    mocks.fetchTasks.mockImplementation(({ projectId }: { projectId: string }) =>
      projectId === project.id ? staleRequest : Promise.resolve([secondIssue]),
    )

    const staleLoad = store.setActiveProject(project.id)
    await store.setActiveProject(secondProject.id)
    rejectFirstProject(new Error('stale failure'))
    await staleLoad

    expect(store.activeProjectId).toBe(secondProject.id)
    expect(store.issues).toEqual([secondIssue])
    expect(store.errorMessage).toBeNull()
  })

  it('keeps the task updatedAt when adding a history', async () => {
    const store = useIssueStore()
    await store.load()
    mocks.createTaskHistory.mockResolvedValue({
      id: 'history-1',
      date: '2026-07-03',
      content: 'Updated',
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    })

    await store.addIssueHistory(issue.id, { date: '2026-07-03', content: 'Updated' })

    expect(store.issues[0]?.updatedAt).toBe(issue.updatedAt)
  })

  it('keeps the task updatedAt when updating a history', async () => {
    const store = useIssueStore()
    const existingHistory = {
      id: 'history-1',
      date: '2026-07-03',
      content: 'Before',
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    }
    mocks.fetchTasks.mockResolvedValue([{ ...issue, histories: [existingHistory] }])
    await store.load()
    mocks.updateTaskHistory.mockResolvedValue({
      ...existingHistory,
      content: 'After',
      updatedAt: '2026-07-04T00:00:00.000Z',
    })

    await store.updateIssueHistory(issue.id, existingHistory.id, {
      date: existingHistory.date,
      content: 'After',
    })

    expect(store.issues[0]?.updatedAt).toBe(issue.updatedAt)
  })
})
