import type { IssuePriority, IssueStatus } from '../types/issue'

export const ISSUE_STATUSES: IssueStatus[] = [
  '未着手',
  '対応中',
  'レビュー待ち',
  '完了',
  '保留',
]

export const ISSUE_PRIORITIES: IssuePriority[] = ['低', '中', '高', '緊急']

export const PRIORITY_WEIGHT: Record<IssuePriority, number> = {
  緊急: 4,
  高: 3,
  中: 2,
  低: 1,
}
