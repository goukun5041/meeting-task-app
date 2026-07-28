import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({
    query: mocks.query,
    transaction: mocks.transaction,
  }),
}))

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn((value) => value),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(),
}))

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(async (token: string) => {
      if (token === 'valid-token') return { uid: 'firebase-user-1', email: 'user@example.com', name: 'User' }
      throw new Error('invalid token')
    }),
  })),
}))

process.env.DATABASE_URL = 'postgres://example.invalid/db'
process.env.FIREBASE_PROJECT_ID = 'test-project'
process.env.FIREBASE_CLIENT_EMAIL = 'firebase-admin@example.com'
process.env.FIREBASE_PRIVATE_KEY = 'test-private-key'

const { handler } = await import('../netlify/functions/api')

function event({
  headers = {},
  method = 'GET',
  path = '/api/projects',
  body = null,
}: {
  headers?: Record<string, string>
  method?: string
  path?: string
  body?: string | null
} = {}) {
  return {
    httpMethod: method,
    path,
    headers,
    queryStringParameters: null,
    body,
    isBase64Encoded: false,
  } as any
}

function authedEvent(overrides: Omit<Parameters<typeof event>[0], 'headers'> = {}) {
  return event({ ...overrides, headers: { authorization: 'Bearer valid-token' } })
}

beforeEach(() => {
  mocks.query.mockReset()
  mocks.transaction.mockReset()
  mocks.query.mockImplementation(async (query: string) => {
    if (query.includes('INSERT INTO users')) return [{ id: 'user-1' }]
    return []
  })
})

describe('api auth', () => {
  it('returns 401 without Authorization header', async () => {
    const response = await handler(event(), {} as any, () => undefined)
    expect(response?.statusCode).toBe(401)
  })

  it('returns 401 for malformed Bearer header', async () => {
    const response = await handler(event({ headers: { authorization: 'Token abc' } }), {} as any, () => undefined)
    expect(response?.statusCode).toBe(401)
  })

  it('returns 401 for invalid token', async () => {
    const response = await handler(
      event({ headers: { authorization: 'Bearer invalid-token' } }),
      {} as any,
      () => undefined,
    )
    expect(response?.statusCode).toBe(401)
  })

  it('returns a structured configuration error when DATABASE_URL is missing', async () => {
    const databaseUrl = process.env.DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      const response = await handler(
        authedEvent({ path: '/api/unknown' }),
        {} as any,
        () => undefined,
      )
      expect(response?.statusCode).toBe(500)
      expect(JSON.parse(response?.body ?? '{}')).toEqual({
        error: { code: 'server_config_error', message: 'Database is not configured' },
      })
    } finally {
      process.env.DATABASE_URL = databaseUrl
    }
  })

  it('resolves an unchanged existing user without forcing an update', async () => {
    mocks.query.mockResolvedValueOnce([
      { id: 'user-1', email: 'user@example.com', display_name: 'User' },
    ])

    const response = await handler(
      authedEvent({ path: '/api/unknown' }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(404)
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.calls[0]?.[0]).toContain('SELECT id, email, display_name FROM users')
  })
})

describe('api migration', () => {
  const migrationBody = JSON.stringify({
    version: 2,
    activeProjectId: 'project-1',
    projects: [
      {
        id: 'project-1',
        name: 'Project',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    issues: [],
  })

  it('claims the migration inside the database transaction', async () => {
    const queries: string[] = []
    mocks.transaction.mockImplementation(async (factory: (tx: any) => unknown[]) => {
      factory({
        query: (query: string) => {
          queries.push(query)
          return { queryData: {} }
        },
      })
      return []
    })

    const response = await handler(
      authedEvent({ method: 'POST', path: '/api/migration/import-local-data', body: migrationBody }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(200)
    expect(queries[0]).toContain('begin_local_data_migration')
  })

  it('returns 409 when the database rejects a repeated migration', async () => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error('already migrated'), { code: 'P0001' }))

    const response = await handler(
      authedEvent({ method: 'POST', path: '/api/migration/import-local-data', body: migrationBody }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(409)
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ error: { code: 'already_migrated' } })
  })
})

describe('api validation', () => {
  it('returns 400 for an empty project name', async () => {
    const response = await handler(
      authedEvent({ method: 'POST', body: JSON.stringify({ name: '   ' }) }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(400)
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ error: { code: 'validation_error' } })
  })

  it('returns 409 for a database uniqueness conflict', async () => {
    mocks.query.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO users')) return [{ id: 'user-1' }]
      if (query.includes('INSERT INTO projects')) {
        throw Object.assign(new Error('duplicate key'), { code: '23505' })
      }
      return []
    })

    const response = await handler(
      authedEvent({ method: 'POST', body: JSON.stringify({ name: 'Duplicate' }) }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(409)
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ error: { code: 'conflict' } })
  })

  it('returns 413 when a multibyte request body exceeds the byte limit', async () => {
    const response = await handler(
      authedEvent({ method: 'POST', body: JSON.stringify({ name: 'あ'.repeat(180_000) }) }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(413)
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ error: { code: 'payload_too_large' } })
  })

  it('returns 400 for an impossible calendar date', async () => {
    const response = await handler(
      authedEvent({
        method: 'POST',
        path: '/api/tasks',
        body: JSON.stringify({
          projectId: 'project-1',
          title: 'Task',
          description: '',
          status: '未着手',
          priority: '中',
          dueDate: '2026-02-30',
        }),
      }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(400)
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ error: { code: 'validation_error' } })
  })
})
