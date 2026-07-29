import { apiRequest } from './httpClient'

export type LocalDataImportMode = 'merge' | 'overwrite'

export async function importLocalData(data: unknown, mode: LocalDataImportMode): Promise<void> {
  await apiRequest<void>('/api/migration/import-local-data', {
    method: 'POST',
    body: JSON.stringify({ mode, data }),
  })
}
