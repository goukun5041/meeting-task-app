import type { Handler, HandlerEvent } from '@netlify/functions'
import { neon } from '@neondatabase/serverless'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const MAX_BODY_BYTES = 512 * 1024
const STATUSES = ['未着手', '対応中', 'レビュー待ち', '完了', '保留'] as const
const PRIORITIES = ['低', '中', '高', '緊急'] as const
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const projectInputSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict()
const projectUpdateSchema = projectInputSchema.extend({ updatedAt: z.string().min(1) }).strict()
const taskInputSchema = z
  .object({
    projectId: z.string().regex(ID_PATTERN).max(128),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(1000).default(''),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    dueDate: z.string().regex(DATE_PATTERN).nullable(),
  })
  .strict()
const taskUpdateSchema = taskInputSchema.extend({ updatedAt: z.string().min(1) }).strict()
const historyInputSchema = z
  .object({
    date: z.string().regex(DATE_PATTERN),
    content: z.string().trim().min(1).max(2000),
  })
  .strict()
const historyUpdateSchema = historyInputSchema.extend({ updatedAt: z.string().min(1) }).strict()

const migrationProjectSchema = z
  .object({
    id: z.string().regex(ID_PATTERN).max(128),
    name: z.string().trim().min(1).max(80),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()
const migrationHistorySchema = z
  .object({
    id: z.string().regex(ID_PATTERN).max(128),
    date: z.string().regex(DATE_PATTERN),
    content: z.string().trim().min(1).max(2000),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()
const migrationTaskSchema = z
  .object({
    id: z.string().regex(ID_PATTERN).max(128),
    projectId: z.string().regex(ID_PATTERN).max(128),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(1000).default(''),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    dueDate: z.string().regex(DATE_PATTERN).nullable(),
    histories: z.array(migrationHistorySchema).max(1000).default([]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()
const migrationSchema = z
  .object({
    version: z.literal(2),
    activeProjectId: z.string().regex(ID_PATTERN).max(128),
    projects: z.array(migrationProjectSchema).min(1).max(100),
    issues: z.array(migrationTaskSchema).max(5000),
  })
  .strict()

type AuthedContext = {
  userId: string
  firebaseUid: string
}

type QueryParams = Record<string, string | undefined>

const sql = getSql()

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return empty(204)

    const auth = await requireAuth(event)
    const path = getRoutePath(event)
    const segments = path.split('/').filter(Boolean)

    if (segments[0] === 'projects') return handleProjects(event, auth, segments)
    if (segments[0] === 'tasks') return handleTasks(event, auth, segments)
    if (segments[0] === 'migration') return handleMigration(event, auth, segments)

    return error(404, 'not_found', 'API path not found')
  } catch (err) {
    if (err instanceof ApiError) return error(err.status, err.code, err.message)
    console.error('api_error', sanitizeError(err))
    return error(500, 'internal_error', 'Internal server error')
  }
}

async function handleProjects(event: HandlerEvent, auth: AuthedContext, segments: string[]) {
  if (segments.length === 1 && event.httpMethod === 'GET') {
    const rows = await sql.query(
      `SELECT id, name, created_at, updated_at
       FROM projects
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [auth.userId],
    )
    return json({ projects: rows.map(mapProject) })
  }

  if (segments.length === 1 && event.httpMethod === 'POST') {
    const input = projectInputSchema.parse(readJson(event))
    const id = createId('project')
    const rows = await sql.query(
      `INSERT INTO projects (id, user_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, name, created_at, updated_at`,
      [id, auth.userId, input.name],
    )
    return json({ project: mapProject(rows[0]) }, 201)
  }

  if (segments.length === 2 && event.httpMethod === 'PUT') {
    const projectId = parseId(segments[1])
    const input = projectUpdateSchema.parse(readJson(event))
    const rows = await sql.query(
      `UPDATE projects
       SET name = $3
       WHERE user_id = $1 AND id = $2 AND updated_at = $4::timestamptz
       RETURNING id, name, created_at, updated_at`,
      [auth.userId, projectId, input.name, input.updatedAt],
    )
    if (rows.length) return json({ project: mapProject(rows[0]) })
    return await throwConflictOrNotFound('projects', auth.userId, projectId)
  }

  if (segments.length === 2 && event.httpMethod === 'DELETE') {
    const projectId = parseId(segments[1])
    const rows = await sql.query(
      `DELETE FROM projects WHERE user_id = $1 AND id = $2 RETURNING id`,
      [auth.userId, projectId],
    )
    if (!rows.length) throw new ApiError(404, 'not_found', 'Project not found')
    return empty(204)
  }

  return error(405, 'method_not_allowed', 'Method not allowed')
}

async function handleTasks(event: HandlerEvent, auth: AuthedContext, segments: string[]) {
  if (segments.length === 1 && event.httpMethod === 'GET') return listTasks(event, auth)

  if (segments.length === 1 && event.httpMethod === 'POST') {
    const input = taskInputSchema.parse(readJson(event))
    await ensureProject(auth.userId, input.projectId)
    const id = createId('issue')
    const rows = await sql.query(
      `INSERT INTO tasks (id, user_id, project_id, title, description, status, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, auth.userId, input.projectId, input.title, input.description, input.status, input.priority, input.dueDate],
    )
    return json({ task: mapTask(rows[0]) }, 201)
  }

  if (segments.length === 2 && event.httpMethod === 'GET') {
    const taskId = parseId(segments[1])
    const rows = await sql.query(`SELECT * FROM tasks WHERE user_id = $1 AND id = $2`, [auth.userId, taskId])
    if (!rows.length) throw new ApiError(404, 'not_found', 'Task not found')
    return json({ task: mapTask(rows[0]) })
  }

  if (segments.length === 2 && event.httpMethod === 'PUT') {
    const taskId = parseId(segments[1])
    const input = taskUpdateSchema.parse(readJson(event))
    await ensureProject(auth.userId, input.projectId)
    const rows = await sql.query(
      `UPDATE tasks
       SET project_id = $3, title = $4, description = $5, status = $6, priority = $7, due_date = $8
       WHERE user_id = $1 AND id = $2 AND updated_at = $9::timestamptz
       RETURNING *`,
      [
        auth.userId,
        taskId,
        input.projectId,
        input.title,
        input.description,
        input.status,
        input.priority,
        input.dueDate,
        input.updatedAt,
      ],
    )
    if (rows.length) return json({ task: mapTask(rows[0]) })
    return await throwConflictOrNotFound('tasks', auth.userId, taskId)
  }

  if (segments.length === 2 && event.httpMethod === 'DELETE') {
    const taskId = parseId(segments[1])
    const rows = await sql.query(`DELETE FROM tasks WHERE user_id = $1 AND id = $2 RETURNING id`, [auth.userId, taskId])
    if (!rows.length) throw new ApiError(404, 'not_found', 'Task not found')
    return empty(204)
  }

  if (segments.length === 3 && segments[2] === 'histories' && event.httpMethod === 'GET') {
    return listHistories(auth, segments[1])
  }

  if (segments.length === 3 && segments[2] === 'histories' && event.httpMethod === 'POST') {
    return createHistory(event, auth, segments[1])
  }

  if (segments.length === 4 && segments[2] === 'histories' && event.httpMethod === 'PUT') {
    return updateHistory(event, auth, segments[1], segments[3])
  }

  if (segments.length === 4 && segments[2] === 'histories' && event.httpMethod === 'DELETE') {
    return deleteHistory(auth, segments[1], segments[3])
  }

  return error(405, 'method_not_allowed', 'Method not allowed')
}

async function listTasks(event: HandlerEvent, auth: AuthedContext) {
  const params = event.queryStringParameters ?? {}
  const clauses = ['user_id = $1']
  const values: unknown[] = [auth.userId]
  addFilter(clauses, values, params, 'projectId', 'project_id')
  addFilter(clauses, values, params, 'status', 'status')
  addFilter(clauses, values, params, 'priority', 'priority')

  const keyword = params.keyword?.trim()
  if (keyword) {
    values.push(`%${keyword.toLowerCase()}%`)
    clauses.push(`(LOWER(title) LIKE $${values.length} OR LOWER(description) LIKE $${values.length})`)
  }

  const rows = await sql.query(
    `SELECT * FROM tasks
     WHERE ${clauses.join(' AND ')}
     ORDER BY CASE WHEN status = '完了' THEN 1 ELSE 0 END ASC,
              CASE priority WHEN '緊急' THEN 4 WHEN '高' THEN 3 WHEN '中' THEN 2 ELSE 1 END DESC,
              updated_at DESC`,
    values,
  )
  return json({ tasks: rows.map(mapTask) })
}

async function listHistories(auth: AuthedContext, taskIdRaw: string) {
  const taskId = parseId(taskIdRaw)
  await ensureTask(auth.userId, taskId)
  const rows = await sql.query(
    `SELECT * FROM task_histories WHERE user_id = $1 AND task_id = $2 ORDER BY action_date DESC, created_at ASC`,
    [auth.userId, taskId],
  )
  return json({ histories: rows.map(mapHistory) })
}

async function createHistory(event: HandlerEvent, auth: AuthedContext, taskIdRaw: string) {
  const taskId = parseId(taskIdRaw)
  const input = historyInputSchema.parse(readJson(event))
  await ensureTask(auth.userId, taskId)
  const id = createId('history')
  const rows = await sql.query(
    `INSERT INTO task_histories (id, user_id, task_id, action_date, content)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [id, auth.userId, taskId, input.date, input.content],
  )
  return json({ history: mapHistory(rows[0]) }, 201)
}

async function updateHistory(event: HandlerEvent, auth: AuthedContext, taskIdRaw: string, historyIdRaw: string) {
  const taskId = parseId(taskIdRaw)
  const historyId = parseId(historyIdRaw)
  const input = historyUpdateSchema.parse(readJson(event))
  await ensureTask(auth.userId, taskId)
  const rows = await sql.query(
    `UPDATE task_histories
     SET action_date = $4, content = $5
     WHERE user_id = $1 AND task_id = $2 AND id = $3 AND updated_at = $6::timestamptz
     RETURNING *`,
    [auth.userId, taskId, historyId, input.date, input.content, input.updatedAt],
  )
  if (rows.length) return json({ history: mapHistory(rows[0]) })
  return await throwConflictOrNotFound('task_histories', auth.userId, historyId, taskId)
}

async function deleteHistory(auth: AuthedContext, taskIdRaw: string, historyIdRaw: string) {
  const taskId = parseId(taskIdRaw)
  const historyId = parseId(historyIdRaw)
  const rows = await sql.query(
    `DELETE FROM task_histories WHERE user_id = $1 AND task_id = $2 AND id = $3 RETURNING id`,
    [auth.userId, taskId, historyId],
  )
  if (!rows.length) throw new ApiError(404, 'not_found', 'History not found')
  return empty(204)
}

async function handleMigration(event: HandlerEvent, auth: AuthedContext, segments: string[]) {
  if (segments.length !== 2 || segments[1] !== 'import-local-data' || event.httpMethod !== 'POST') {
    return error(405, 'method_not_allowed', 'Method not allowed')
  }

  const data = migrationSchema.parse(readJson(event))
  const projectIds = new Set(data.projects.map((project) => project.id))
  if (!projectIds.has(data.activeProjectId)) throw new ApiError(400, 'validation_error', 'activeProjectId is invalid')
  for (const task of data.issues) {
    if (!projectIds.has(task.projectId)) throw new ApiError(400, 'validation_error', 'Task projectId is invalid')
  }

  const stateRows = await sql.query(
    `SELECT
       local_data_migrated_at,
       EXISTS (SELECT 1 FROM projects WHERE user_id = users.id) AS has_projects,
       EXISTS (SELECT 1 FROM tasks WHERE user_id = users.id) AS has_tasks
     FROM users WHERE id = $1`,
    [auth.userId],
  )
  const state = stateRows[0]
  if (state?.local_data_migrated_at || state?.has_projects || state?.has_tasks) {
    throw new ApiError(409, 'already_migrated', 'Local data migration is not available for this account')
  }

  await sql.transaction((tx) => {
    const queries = []
    for (const project of data.projects) {
      queries.push(
        tx.query(
          `INSERT INTO projects (id, user_id, name, created_at, updated_at)
           VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
          [project.id, auth.userId, project.name, project.createdAt, project.updatedAt],
        ),
      )
    }
    for (const task of data.issues) {
      queries.push(
        tx.query(
          `INSERT INTO tasks (id, user_id, project_id, title, description, status, priority, due_date, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)`,
          [
            task.id,
            auth.userId,
            task.projectId,
            task.title,
            task.description,
            task.status,
            task.priority,
            task.dueDate,
            task.createdAt,
            task.updatedAt,
          ],
        ),
      )
      for (const history of task.histories) {
        queries.push(
          tx.query(
            `INSERT INTO task_histories (id, user_id, task_id, action_date, content, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)`,
            [history.id, auth.userId, task.id, history.date, history.content, history.createdAt, history.updatedAt],
          ),
        )
      }
    }
    queries.push(tx.query(`UPDATE users SET local_data_migrated_at = NOW() WHERE id = $1`, [auth.userId]))
    return queries
  })

  return json({ imported: true })
}

async function requireAuth(event: HandlerEvent): Promise<AuthedContext> {
  const header = event.headers.authorization ?? event.headers.Authorization
  if (!header) throw new ApiError(401, 'unauthorized', 'Authorization header is required')
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) throw new ApiError(401, 'unauthorized', 'Authorization header must use Bearer token')

  initializeFirebaseAdmin()
  let decoded
  try {
    decoded = await getAuth().verifyIdToken(match[1])
  } catch {
    throw new ApiError(401, 'unauthorized', 'Invalid or expired token')
  }

  const firebaseUid = decoded.uid
  const email = typeof decoded.email === 'string' ? decoded.email : null
  const displayName = typeof decoded.name === 'string' ? decoded.name : null
  const rows = await sql.query(
    `INSERT INTO users (id, firebase_uid, email, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name
     RETURNING id`,
    [createId('user'), firebaseUid, email, displayName],
  )

  return { userId: rows[0].id, firebaseUid }
}

function initializeFirebaseAdmin(): void {
  if (getApps().length) return
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new ApiError(500, 'server_config_error', 'Authentication is not configured')
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

function getSql() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured')
  return neon(databaseUrl)
}

function readJson(event: HandlerEvent): unknown {
  const body = event.body ?? ''
  if (body.length > MAX_BODY_BYTES) throw new ApiError(413, 'payload_too_large', 'Request body is too large')
  if (!body) return {}
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body)
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON')
  }
}

function addFilter(clauses: string[], values: unknown[], params: QueryParams, paramName: string, columnName: string): void {
  const value = params[paramName]
  if (!value) return
  values.push(value)
  clauses.push(`${columnName} = $${values.length}`)
}

async function ensureProject(userId: string, projectId: string): Promise<void> {
  const rows = await sql.query(`SELECT id FROM projects WHERE user_id = $1 AND id = $2`, [userId, projectId])
  if (!rows.length) throw new ApiError(404, 'not_found', 'Project not found')
}

async function ensureTask(userId: string, taskId: string): Promise<void> {
  const rows = await sql.query(`SELECT id FROM tasks WHERE user_id = $1 AND id = $2`, [userId, taskId])
  if (!rows.length) throw new ApiError(404, 'not_found', 'Task not found')
}

async function throwConflictOrNotFound(table: string, userId: string, id: string, taskId?: string): Promise<never> {
  const rows = await sql.query(
    taskId
      ? `SELECT id FROM task_histories WHERE user_id = $1 AND task_id = $2 AND id = $3`
      : `SELECT id FROM ${table} WHERE user_id = $1 AND id = $2`,
    taskId ? [userId, taskId, id] : [userId, id],
  )
  if (rows.length) throw new ApiError(409, 'conflict', 'The record was updated by another session')
  throw new ApiError(404, 'not_found', 'Record not found')
}

function parseId(value: string | undefined): string {
  if (!value || !ID_PATTERN.test(value)) throw new ApiError(400, 'validation_error', 'Invalid id')
  return value
}

function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

function getRoutePath(event: HandlerEvent): string {
  return event.path
    .replace(/^\/\.netlify\/functions\/api\/?/, '')
    .replace(/^\/api\/?/, '')
    .replace(/^\/?/, '')
}

function mapProject(row: any) {
  return {
    id: row.id,
    name: row.name,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapTask(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
    histories: [],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function mapHistory(row: any) {
  return {
    id: row.id,
    date: row.action_date ? String(row.action_date).slice(0, 10) : '',
    content: row.content,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: responseHeaders(),
    body: JSON.stringify(body),
  }
}

function empty(statusCode: number) {
  return { statusCode, headers: responseHeaders(), body: '' }
}

function error(statusCode: number, code: string, message: string) {
  return json({ error: { code, message } }, statusCode)
}

function responseHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  }
}

function sanitizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
