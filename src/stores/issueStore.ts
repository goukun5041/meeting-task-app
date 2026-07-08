import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { PRIORITY_WEIGHT } from '../constants/issueOptions'
import type { Issue, IssueFormInput } from '../types/issue'
import { loadIssues, saveIssues } from '../utils/storage'

const now = new Date()
const today = now.toISOString().slice(0, 10)
const nextWeek = new Date(now)
nextWeek.setDate(now.getDate() + 7)

const sampleIssues: Issue[] = [
  {
    id: 'issue-001',
    title: '議事録テンプレートを整理する',
    description: '定例会で使う議事録テンプレートの項目を見直す。',
    status: '対応中',
    priority: '高',
    dueDate: nextWeek.toISOString().slice(0, 10),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 'issue-002',
    title: 'タスク棚卸しの確認',
    description: '未着手の課題を確認し、優先度を調整する。',
    status: '未着手',
    priority: '中',
    dueDate: today,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 'issue-003',
    title: '完了済み課題のレビュー',
    description: '',
    status: '完了',
    priority: '低',
    dueDate: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
]

function createIssueId(): string {
  if (globalThis.crypto?.randomUUID) {
    return `issue-${globalThis.crypto.randomUUID()}`
  }

  return `issue-${Date.now()}`
}

export const useIssueStore = defineStore('issues', () => {
  const issues = ref<Issue[]>([])

  const sortedIssues = computed(() =>
    [...issues.value].sort((a, b) => {
      if (a.status === '完了' && b.status !== '完了') return 1
      if (a.status !== '完了' && b.status === '完了') return -1

      const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      if (priorityDiff !== 0) return priorityDiff

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }),
  )

  const summary = computed(() => ({
    total: issues.value.length,
    active: issues.value.filter((issue) => issue.status !== '完了').length,
    done: issues.value.filter((issue) => issue.status === '完了').length,
    urgent: issues.value.filter((issue) => issue.priority === '緊急').length,
  }))

  function persist(): void {
    saveIssues(issues.value)
  }

  function load(): void {
    const storedIssues = loadIssues()
    issues.value = storedIssues ?? sampleIssues
    if (!storedIssues) persist()
  }

  function createIssue(input: IssueFormInput): Issue {
    const timestamp = new Date().toISOString()
    const issue: Issue = {
      ...input,
      id: createIssueId(),
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

  function getIssueById(id: string): Issue | undefined {
    return issues.value.find((issue) => issue.id === id)
  }

  return {
    issues,
    sortedIssues,
    summary,
    load,
    createIssue,
    updateIssue,
    deleteIssue,
    getIssueById,
  }
})
