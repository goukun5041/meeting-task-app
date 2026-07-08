export type IssueStatus = '未着手' | '対応中' | 'レビュー待ち' | '完了' | '保留'

export type IssuePriority = '低' | '中' | '高' | '緊急'

export interface Issue {
  id: string
  title: string
  description: string
  status: IssueStatus
  priority: IssuePriority
  dueDate: string | null
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
