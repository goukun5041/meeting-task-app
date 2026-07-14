export type IssueStatus = '未着手' | '対応中' | 'レビュー待ち' | '完了' | '保留'

export type IssuePriority = '低' | '中' | '高' | '緊急'

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface ProjectFormInput {
  name: string
}

export interface IssueHistory {
  id: string
  date: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface Issue {
  id: string
  projectId: string
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  dueDate: string | null
  histories: IssueHistory[]
  createdAt: string
  updatedAt: string
}

export interface IssueFormInput {
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  dueDate: string | null
}

export interface IssueHistoryInput {
  date: string
  content: string
}
