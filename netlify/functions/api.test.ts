import { describe, expect, it, vi } from 'vitest'

vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({
    query: vi.fn(),
    transaction: vi.fn(),
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
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----'

const { handler } = await import('./api')

function event(headers: Record<string, string> = {}) {
  return {
    httpMethod: 'GET',
    path: '/api/projects',
    headers,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
  } as any
}

describe('api auth', () => {
  it('returns 401 without Authorization header', async () => {
    const response = await handler(event(), {} as any, () => undefined)
    expect(response?.statusCode).toBe(401)
  })

  it('returns 401 for malformed Bearer header', async () => {
    const response = await handler(event({ authorization: 'Token abc' }), {} as any, () => undefined)
    expect(response?.statusCode).toBe(401)
  })

  it('returns 401 for invalid token', async () => {
    const response = await handler(event({ authorization: 'Bearer invalid-token' }), {} as any, () => undefined)
    expect(response?.statusCode).toBe(401)
  })
})
