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
  mocks.transaction.mockImplementation(async (factory: (tx: any) => Promise<unknown>[]) => {
    const pending = factory({ query: (query: string, params?: unknown[]) => mocks.query(query, params) })
    return await Promise.all(pending)
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

describe('api date serialization', () => {
  const timestamp = '2026-07-30T00:00:00.000Z'
  const historyRow = () => ({
    id: 'history-1',
    task_id: 'task-1',
    action_date: new Date(2026, 6, 30),
    content: 'History',
    created_at: new Date(timestamp),
    updated_at: new Date(timestamp),
  })
  const taskRow = () => ({
    id: 'task-1',
    project_id: 'project-1',
    title: 'Task',
    description: '',
    status: '未着手',
    priority: '中',
    due_date: new Date(2026, 6, 31),
    created_at: new Date(timestamp),
    updated_at: new Date(timestamp),
  })

  it.each([
    { method: 'GET', path: '/api/tasks/task-1/histories', marker: 'SELECT * FROM task_histories', body: null },
    {
      method: 'POST',
      path: '/api/tasks/task-1/histories',
      marker: 'INSERT INTO task_histories',
      body: { date: '2026-07-30', content: 'History' },
    },
    {
      method: 'PUT',
      path: '/api/tasks/task-1/histories/history-1',
      marker: 'UPDATE task_histories',
      body: { date: '2026-07-30', content: 'History', updatedAt: timestamp },
    },
  ])('$method $path serializes action_date as YYYY-MM-DD', async ({ method, path, marker, body }) => {
    mocks.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT id, email, display_name FROM users')) {
        return [{ id: 'user-1', email: 'user@example.com', display_name: 'User' }]
      }
      if (query.includes(marker)) return [historyRow()]
      if (query.includes('SELECT id FROM tasks')) return [{ id: 'task-1' }]
      return []
    })

    const response = await handler(
      authedEvent({ method, path, body: body ? JSON.stringify(body) : null }),
      {} as any,
      () => undefined,
    )
    const responseBody = JSON.parse(response?.body ?? '{}')
    const history = method === 'GET' ? responseBody.histories[0] : responseBody.history

    expect(response?.statusCode).toBe(method === 'POST' ? 201 : 200)
    expect(history.date).toBe('2026-07-30')
  })

  it.each([
    { method: 'GET', path: '/api/tasks', marker: 'SELECT * FROM tasks', body: null, list: true },
    { method: 'GET', path: '/api/tasks/task-1', marker: 'SELECT * FROM tasks', body: null, list: false },
    {
      method: 'POST',
      path: '/api/tasks',
      marker: 'INSERT INTO tasks',
      body: {
        projectId: 'project-1',
        title: 'Task',
        description: '',
        status: '未着手',
        priority: '中',
        dueDate: '2026-07-31',
      },
      list: false,
    },
    {
      method: 'PUT',
      path: '/api/tasks/task-1',
      marker: 'UPDATE tasks',
      body: {
        projectId: 'project-1',
        title: 'Task',
        description: '',
        status: '未着手',
        priority: '中',
        dueDate: '2026-07-31',
        updatedAt: timestamp,
      },
      list: false,
    },
  ])('$method $path serializes due_date as YYYY-MM-DD', async ({ method, path, marker, body, list }) => {
    mocks.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT id, email, display_name FROM users')) {
        return [{ id: 'user-1', email: 'user@example.com', display_name: 'User' }]
      }
      if (query.includes(marker)) return [taskRow()]
      return []
    })

    const response = await handler(
      authedEvent({ method, path, body: body ? JSON.stringify(body) : null }),
      {} as any,
      () => undefined,
    )
    const responseBody = JSON.parse(response?.body ?? '{}')
    const task = list ? responseBody.tasks[0] : responseBody.task

    expect(response?.statusCode).toBe(method === 'POST' ? 201 : 200)
    expect(task.dueDate).toBe('2026-07-31')
  })

  it('preserves a PostgreSQL DATE in JST instead of shifting it to the previous UTC date', async () => {
    const originalTimezone = process.env.TZ
    process.env.TZ = 'Asia/Tokyo'
    try {
      const actionDate = new Date(2026, 6, 30)
      expect(actionDate.toISOString().slice(0, 10)).toBe('2026-07-29')
      mocks.query.mockImplementation(async (query: string) => {
        if (query.includes('SELECT id, email, display_name FROM users')) {
          return [{ id: 'user-1', email: 'user@example.com', display_name: 'User' }]
        }
        if (query.includes('INSERT INTO task_histories')) return [{ ...historyRow(), action_date: actionDate }]
        return []
      })

      const response = await handler(
        authedEvent({
          method: 'POST',
          path: '/api/tasks/task-1/histories',
          body: JSON.stringify({ date: '2026-07-30', content: 'History' }),
        }),
        {} as any,
        () => undefined,
      )

      expect(JSON.parse(response?.body ?? '{}').history.date).toBe('2026-07-30')
    } finally {
      process.env.TZ = originalTimezone
    }
  })
})

describe('api write serialization', () => {
  const writeCases = [
    {
      method: 'POST',
      path: '/api/projects',
      body: { name: 'Project' },
      marker: 'INSERT INTO projects',
    },
    {
      method: 'PUT',
      path: '/api/projects/project-1',
      body: { name: 'Project', updatedAt: '2026-07-01T00:00:00.000Z' },
      marker: 'UPDATE projects',
    },
    { method: 'DELETE', path: '/api/projects/project-1', marker: 'DELETE FROM projects' },
    {
      method: 'POST',
      path: '/api/tasks',
      body: {
        projectId: 'project-1',
        title: 'Task',
        description: '',
        status: '未着手',
        priority: '中',
        dueDate: null,
      },
      marker: 'INSERT INTO tasks',
    },
    {
      method: 'PUT',
      path: '/api/tasks/task-1',
      body: {
        projectId: 'project-1',
        title: 'Task',
        description: '',
        status: '未着手',
        priority: '中',
        dueDate: null,
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      marker: 'UPDATE tasks',
    },
    { method: 'DELETE', path: '/api/tasks/task-1', marker: 'DELETE FROM tasks' },
    {
      method: 'POST',
      path: '/api/tasks/task-1/histories',
      body: { date: '2026-07-01', content: 'History' },
      marker: 'INSERT INTO task_histories',
    },
    {
      method: 'PUT',
      path: '/api/tasks/task-1/histories/history-1',
      body: { date: '2026-07-01', content: 'History', updatedAt: '2026-07-01T00:00:00.000Z' },
      marker: 'UPDATE task_histories',
    },
    {
      method: 'DELETE',
      path: '/api/tasks/task-1/histories/history-1',
      marker: 'DELETE FROM task_histories',
    },
  ]

  it.each(writeCases)('$method $path participates in the migration user lock', async ({ method, path, body, marker }) => {
    const queries: string[] = []
    mocks.query.mockImplementation(async (query: string) => {
      queries.push(query)
      if (query.includes('SELECT id, email, display_name FROM users')) {
        return [{ id: 'user-1', email: 'user@example.com', display_name: 'User' }]
      }
      if (query.includes('SELECT id FROM projects') || query.includes('SELECT id FROM tasks')) return [{ id: 'parent-1' }]
      if (query.includes(marker)) {
        return [
          {
            id: 'result-1',
            name: 'Project',
            project_id: 'project-1',
            title: 'Task',
            description: '',
            status: '未着手',
            priority: '中',
            due_date: null,
            task_id: 'task-1',
            action_date: '2026-07-01',
            content: 'History',
            created_at: '2026-07-01T00:00:00.000Z',
            updated_at: '2026-07-01T00:00:00.000Z',
          },
        ]
      }
      return []
    })

    const response = await handler(
      authedEvent({ method, path, body: body ? JSON.stringify(body) : null }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBeLessThan(400)
    const writeIndex = queries.findIndex((query) => query.includes(marker))
    const writeQuery = queries[writeIndex]
    expect(writeIndex).toBeGreaterThan(0)
    expect(queries[writeIndex - 1]).toContain('FOR UPDATE')
    if (method === 'PUT') {
      expect(writeQuery).toContain("date_trunc('milliseconds', target.updated_at)")
    }
  })

  const missingParentCases = [
    {
      method: 'POST',
      path: '/api/tasks',
      body: {
        projectId: 'missing-project',
        title: 'Task',
        description: '',
        status: '未着手',
        priority: '中',
        dueDate: null,
      },
    },
    {
      method: 'PUT',
      path: '/api/tasks/task-1',
      body: {
        projectId: 'missing-project',
        title: 'Task',
        description: '',
        status: '未着手',
        priority: '中',
        dueDate: null,
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    },
    {
      method: 'POST',
      path: '/api/tasks/missing-task/histories',
      body: { date: '2026-07-01', content: 'History' },
    },
    {
      method: 'PUT',
      path: '/api/tasks/missing-task/histories/history-1',
      body: { date: '2026-07-01', content: 'History', updatedAt: '2026-07-01T00:00:00.000Z' },
    },
  ]

  it.each(missingParentCases)('$method $path returns 404 when migration removed the parent', async ({ method, path, body }) => {
    mocks.query.mockImplementation(async (query: string) => {
      if (query.includes('SELECT id, email, display_name FROM users')) {
        return [{ id: 'user-1', email: 'user@example.com', display_name: 'User' }]
      }
      return []
    })

    const response = await handler(
      authedEvent({ method, path, body: JSON.stringify(body) }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(404)
    expect(JSON.parse(response?.body ?? '{}').error.code).toBe('not_found')
  })
})

describe('api migration', () => {
  const migrationData = {
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
    issues: [
      {
        id: 'task-1',
        projectId: 'project-1',
        title: 'Task',
        description: '',
        status: '未着手',
        priority: '中',
        dueDate: null,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
        histories: [
          {
            id: 'history-1',
            date: '2026-07-02',
            content: 'Updated',
            createdAt: '2026-07-02T00:00:00.000Z',
            updatedAt: '2026-07-02T00:00:00.000Z',
          },
        ],
      },
    ],
  }

  function migrationBody(mode: 'merge' | 'overwrite') {
    return JSON.stringify({ mode, data: migrationData })
  }

  it('merges local data under a user row lock and prefers newer timestamps', async () => {
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
      authedEvent({ method: 'POST', path: '/api/migration/import-local-data', body: migrationBody('merge') }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(200)
    expect(queries[0]).toContain('FOR UPDATE')
    expect(queries.some((query) => query.includes('DELETE FROM projects'))).toBe(false)
    expect(queries.some((query) => query.includes("set_config('meeting_task_app.preserve_updated_at'"))).toBe(true)
    expect(queries.some((query) => query.includes('CREATE TEMP TABLE local_project_snapshot'))).toBe(true)
    expect(
      queries.some(
        (query) => query.includes('CREATE TEMP TABLE local_project_map') && query.includes('target_id TEXT NOT NULL UNIQUE'),
      ),
    ).toBe(true)
    expect(queries.some((query) => query.includes('CREATE TEMP TABLE local_project_updates'))).toBe(true)
    expect(queries.some((query) => query.includes('INSERT INTO local_project_map'))).toBe(true)
    const exactIdMappingIndex = queries.findIndex((query) => query.includes('snapshot.id = $1'))
    const nameMappingIndex = queries.findIndex((query) => query.includes('snapshot.name = $2'))
    expect(exactIdMappingIndex).toBeGreaterThan(0)
    expect(nameMappingIndex).toBeGreaterThan(exactIdMappingIndex)
    const temporaryRenameIndex = queries.findIndex(
      (query) => query.includes('UPDATE projects AS target') && !query.includes('created_at = LEAST'),
    )
    const captureUpdatesIndex = queries.findIndex((query) => query.includes('INSERT INTO local_project_updates'))
    const finalRenameIndex = queries.findIndex(
      (query) => query.includes('UPDATE projects AS target') && query.includes('created_at = LEAST'),
    )
    expect(captureUpdatesIndex).toBeGreaterThan(nameMappingIndex)
    expect(temporaryRenameIndex).toBeGreaterThan(captureUpdatesIndex)
    expect(finalRenameIndex).toBeGreaterThan(temporaryRenameIndex)
    expect(queries.some((query) => query.includes('FROM local_project_map AS mapping'))).toBe(true)
    expect(queries.some((query) => query.includes('EXCLUDED.updated_at > tasks.updated_at'))).toBe(true)
    expect(queries.some((query) => query.includes('EXCLUDED.updated_at > task_histories.updated_at'))).toBe(true)
  })

  it('deletes existing server projects before overwriting them with local data', async () => {
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
      authedEvent({ method: 'POST', path: '/api/migration/import-local-data', body: migrationBody('overwrite') }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(200)
    const deleteIndex = queries.findIndex((query) => query.includes('DELETE FROM projects'))
    const insertIndex = queries.findIndex((query) => query.includes('INSERT INTO projects'))
    expect(deleteIndex).toBeGreaterThan(0)
    expect(insertIndex).toBeGreaterThan(deleteIndex)
  })

  it('rejects an unsupported migration mode', async () => {
    const response = await handler(
      authedEvent({
        method: 'POST',
        path: '/api/migration/import-local-data',
        body: JSON.stringify({ mode: 'append', data: migrationData }),
      }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rolls back and reports an ambiguous project merge as a merge conflict', async () => {
    mocks.transaction.mockRejectedValue(Object.assign(new Error('duplicate target or project name'), { code: '23505' }))

    const response = await handler(
      authedEvent({ method: 'POST', path: '/api/migration/import-local-data', body: migrationBody('merge') }),
      {} as any,
      () => undefined,
    )

    expect(response?.statusCode).toBe(409)
    expect(JSON.parse(response?.body ?? '{}')).toMatchObject({ error: { code: 'merge_conflict' } })
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
