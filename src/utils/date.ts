export function formatDate(value: string | null): string {
  if (!value) return '-'

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(`${value}T00:00:00`))
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function isOverdue(value: string | null, isDone = false): boolean {
  if (!value || isDone) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dueDate = new Date(`${value}T00:00:00`)
  return dueDate < today
}
