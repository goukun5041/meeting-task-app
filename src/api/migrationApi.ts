import { apiRequest } from './httpClient'

export async function importLocalData(data: unknown): Promise<void> {
  await apiRequest<void>('/api/migration/import-local-data', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
