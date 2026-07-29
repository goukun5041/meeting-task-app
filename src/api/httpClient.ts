import { AuthRequiredError, getFirebaseIdToken } from '../auth/authService'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getFirebaseIdToken()
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })

  if (response.status === 401) {
    throw new AuthRequiredError()
  }

  if (!response.ok) {
    const payload = await readJson(response)
    const error = payload?.error
    throw new ApiError(response.status, error?.code ?? 'request_failed', error?.message ?? 'Request failed')
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return null
  }
}
