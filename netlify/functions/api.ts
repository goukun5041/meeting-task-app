import type { Handler, HandlerEvent } from '@netlify/functions'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const MAX_BODY_BYTES = 512 * 1024
const STATUSES = ['未着手', '対応中', 'レビュー待ち', '完了', '保留'] as const
const PRIORITIES = ['低', '中', '高', '緊急'] as const
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const dateSchema = z.iso.date()
const timestampSchema = z.iso.datetime({ offset: true })

const projectInputSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict()
const projectUpdateSchema = projectInputSchema.extend({ updatedAt: timestampSchema }).strict()
const taskInputSchema = z
  .object({
    projectId: z.string().regex(ID_PATTERN).max(128),
    title: z.string().trim().min(1).max(100),
    description: z.string().max(1000).default(''),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    dueDate: dateSchema.nullable(),
  })
  .strict()
const taskUpdateSchema = taskInputSchema.extend({ updatedAt: timestampSchema }).strict()
const historyInputSchema = z
  .object({
    date: dateSchema,
    content: z.string().trim().min(1).max(2000),
  })
  .strict()
const historyUpdateSchema = historyInputSchema.extend({ updatedAt: timestampSchema }).strict()

const migrationProjectSchema = z
  .object({
    id: z.string().regex(ID_PATTERN).max(128),
    name: z.string().trim().min(1).max(80),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
const migrationHistorySchema = z
  .object({
    id: z.string().regex(ID_PATTERN).max(128),
    date: dateSchema,
    content: z.string().trim().min(1).max(2000),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
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
    dueDate: dateSchema.nullable(),
    histories: z.array(migrationHistorySchema).max(1000).default([]),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
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
const migrationRequestSchema = z
  .object({
    mode: z.enum(['merge', 'overwrite']),
    data: migrationSchema,
  })
  .strict()

type AuthedContext = {
  userId: string
  firebaseUid: string
}

type QueryParams = Record<string, string | undefined>

let sql: NeonQueryFunction<false, false> | undefined

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return empty(204)

    const auth = await requireAuth(event)
    const path = getRoutePath(event)
    const segments = path.split('/').filter(Boolean)

    if (segments[0] === 'projects') return await handleProjects(event, auth, segments)
    if (segments[0] === 'tasks') return await handleTasks(event, auth, segments)
    if (segments[0] === 'migration') return await handleMigration(event, auth, segments)

    return error(404, 'not_found', 'API path not found')
  } catch (err) {
    if (err instanceof ApiError) return error(err.status, err.code, err.message)
    if (err instanceof z.ZodError) return error(400, 'validation_error', 'Request validation failed')
    if (getErrorCode(err) === '23505') return error(409, 'conflict', 'A record with the same value already exists')
    console.error('api_error', sanitizeError(err))
    return error(500, 'internal_error', 'Internal server error')
  }
}

async function handleProjects(event: HandlerEvent, auth: AuthedContext, segments: string[]) {
  if (segments.length === 1 && event.httpMethod === 'GET') {
    const rows = await database().query(
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
    const rows = await executeUserWrite(
      auth.userId,
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
    const rows = await executeUserWrite(
      auth.userId,
      `UPDATE projects AS target
       SET name = $3
       WHERE target.user_id = $1
         AND target.id = $2
         AND date_trunc('milliseconds', target.updated_at) = $4::timestamptz
       RETURNING target.id, target.name, target.created_at, target.updated_at`,
      [auth.userId, projectId, input.name, input.updatedAt],
    )
    if (rows.length) return json({ project: mapProject(rows[0]) })
    return await throwConflictOrNotFound('projects', auth.userId, projectId)
  }

  if (segments.length === 2 && event.httpMethod === 'DELETE') {
    const projectId = parseId(segments[1])
    const rows = await executeUserWrite(
      auth.userId,
      `DELETE FROM projects AS target
       WHERE target.user_id = $1 AND target.id = $2
       RETURNING target.id`,
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
    const id = createId('issue')
    const rows = await executeUserWrite(
      auth.userId,
      `INSERT INTO tasks (id, user_id, project_id, title, description, status, priority, due_date)
       SELECT $1, $2, parent.id, $4, $5, $6, $7, $8
       FROM projects AS parent
       WHERE parent.user_id = $2 AND parent.id = $3
       RETURNING tasks.*`,
      [id, auth.userId, input.projectId, input.title, input.description, input.status, input.priority, input.dueDate],
    )
    if (!rows.length) throw new ApiError(404, 'not_found', 'Project not found')
    return json({ task: mapTask(rows[0]) }, 201)
  }

  if (segments.length === 2 && event.httpMethod === 'GET') {
    const taskId = parseId(segments[1])
    const rows = await database().query(`SELECT * FROM tasks WHERE user_id = $1 AND id = $2`, [auth.userId, taskId])
    if (!rows.length) throw new ApiError(404, 'not_found', 'Task not found')
    return json({ task: mapTask(rows[0]) })
  }

  if (segments.length === 2 && event.httpMethod === 'PUT') {
    const taskId = parseId(segments[1])
    const input = taskUpdateSchema.parse(readJson(event))
    const rows = await executeUserWrite(
      auth.userId,
      `UPDATE tasks AS target
       SET project_id = $3, title = $4, description = $5, status = $6, priority = $7, due_date = $8
       FROM projects AS parent
       WHERE target.user_id = $1
         AND target.id = $2
         AND parent.user_id = $1
         AND parent.id = $3
         AND date_trunc('milliseconds', target.updated_at) = $9::timestamptz
       RETURNING target.*`,
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
    await ensureProject(auth.userId, input.projectId)
    return await throwConflictOrNotFound('tasks', auth.userId, taskId)
  }

  if (segments.length === 2 && event.httpMethod === 'DELETE') {
    const taskId = parseId(segments[1])
    const rows = await executeUserWrite(
      auth.userId,
      `DELETE FROM tasks AS target
       WHERE target.user_id = $1 AND target.id = $2
       RETURNING target.id`,
      [auth.userId, taskId],
    )
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

  const rows = await database().query(
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
  const rows = await database().query(
    `SELECT * FROM task_histories WHERE user_id = $1 AND task_id = $2 ORDER BY action_date DESC, created_at ASC`,
    [auth.userId, taskId],
  )
  return json({ histories: rows.map(mapHistory) })
}

async function createHistory(event: HandlerEvent, auth: AuthedContext, taskIdRaw: string) {
  const taskId = parseId(taskIdRaw)
  const input = historyInputSchema.parse(readJson(event))
  const id = createId('history')
  const rows = await executeUserWrite(
    auth.userId,
    `INSERT INTO task_histories (id, user_id, task_id, action_date, content)
     SELECT $1, $2, parent.id, $4, $5
     FROM tasks AS parent
     WHERE parent.user_id = $2 AND parent.id = $3
     RETURNING task_histories.*`,
    [id, auth.userId, taskId, input.date, input.content],
  )
  if (!rows.length) throw new ApiError(404, 'not_found', 'Task not found')
  return json({ history: mapHistory(rows[0]) }, 201)
}

async function updateHistory(event: HandlerEvent, auth: AuthedContext, taskIdRaw: string, historyIdRaw: string) {
  const taskId = parseId(taskIdRaw)
  const historyId = parseId(historyIdRaw)
  const input = historyUpdateSchema.parse(readJson(event))
  const rows = await executeUserWrite(
    auth.userId,
    `UPDATE task_histories AS target
     SET action_date = $4, content = $5
     FROM tasks AS parent
     WHERE target.user_id = $1
       AND target.task_id = $2
       AND target.id = $3
       AND parent.user_id = $1
       AND parent.id = $2
       AND date_trunc('milliseconds', target.updated_at) = $6::timestamptz
     RETURNING target.*`,
    [auth.userId, taskId, historyId, input.date, input.content, input.updatedAt],
  )
  if (rows.length) return json({ history: mapHistory(rows[0]) })
  await ensureTask(auth.userId, taskId)
  return await throwConflictOrNotFound('task_histories', auth.userId, historyId, taskId)
}

async function deleteHistory(auth: AuthedContext, taskIdRaw: string, historyIdRaw: string) {
  const taskId = parseId(taskIdRaw)
  const historyId = parseId(historyIdRaw)
  const rows = await executeUserWrite(
    auth.userId,
    `DELETE FROM task_histories AS target
     WHERE target.user_id = $1 AND target.task_id = $2 AND target.id = $3
     RETURNING target.id`,
    [auth.userId, taskId, historyId],
  )
  if (!rows.length) throw new ApiError(404, 'not_found', 'History not found')
  return empty(204)
}

async function handleMigration(event: HandlerEvent, auth: AuthedContext, segments: string[]) {
  if (segments.length !== 2 || segments[1] !== 'import-local-data' || event.httpMethod !== 'POST') {
    return error(405, 'method_not_allowed', 'Method not allowed')
  }

  const { mode, data } = migrationRequestSchema.parse(readJson(event))
  const projectIds = new Set(data.projects.map((project) => project.id))
  if (!projectIds.has(data.activeProjectId)) throw new ApiError(400, 'validation_error', 'activeProjectId is invalid')
  for (const task of data.issues) {
    if (!projectIds.has(task.projectId)) throw new ApiError(400, 'validation_error', 'Task projectId is invalid')
  }

  try {
    await database().transaction((tx) => {
      const queries = [
      tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [auth.userId]),
      tx.query(
        `UPDATE users
         SET local_data_migrated_at = COALESCE(local_data_migrated_at, NOW())
         WHERE id = $1`,
        [auth.userId],
      ),
    ]

    if (mode === 'overwrite') {
      queries.push(tx.query(`DELETE FROM projects WHERE user_id = $1`, [auth.userId]))
    } else {
      queries.push(
        tx.query(`SELECT set_config('meeting_task_app.preserve_updated_at', 'on', TRUE)`),
        tx.query(
          `CREATE TEMP TABLE local_project_snapshot ON COMMIT DROP AS
           SELECT id, name FROM projects WHERE user_id = $1`,
          [auth.userId],
        ),
        tx.query(
          `CREATE TEMP TABLE local_project_map (
             local_id TEXT PRIMARY KEY,
             target_id TEXT NOT NULL UNIQUE,
             local_name TEXT NOT NULL
           ) ON COMMIT DROP`,
        ),
        tx.query(
          `CREATE TEMP TABLE local_project_updates (
             local_id TEXT PRIMARY KEY
           ) ON COMMIT DROP`,
        ),
      )
    }

    if (mode === 'overwrite') {
      for (const project of data.projects) {
        queries.push(
          tx.query(
            `INSERT INTO projects (id, user_id, name, created_at, updated_at)
             VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
            [project.id, auth.userId, project.name, project.createdAt, project.updatedAt],
          ),
        )
      }
    } else {
      // Reserve every exact ID match before considering names so input order cannot collapse two projects.
      for (const project of data.projects) {
        queries.push(
          tx.query(
            `INSERT INTO local_project_map (local_id, target_id, local_name)
             SELECT $1, snapshot.id, $2
             FROM local_project_snapshot AS snapshot
             WHERE snapshot.id = $1`,
            [project.id, project.name],
          ),
        )
      }

      // A same-name match is allowed only when an exact-ID mapping has not already reserved that server project.
      for (const project of data.projects) {
        queries.push(
          tx.query(
            `INSERT INTO local_project_map (local_id, target_id, local_name)
             SELECT $1,
                    COALESCE(
                      (
                        SELECT snapshot.id
                        FROM local_project_snapshot AS snapshot
                        WHERE snapshot.name = $2
                          AND NOT EXISTS (
                            SELECT 1 FROM local_project_map AS reserved
                            WHERE reserved.target_id = snapshot.id
                          )
                      ),
                      $1
                    ),
                    $2
             WHERE NOT EXISTS (
               SELECT 1 FROM local_project_map AS mapped WHERE mapped.local_id = $1
             )`,
            [project.id, project.name],
          ),
        )
      }

      // Capture update eligibility before temporary renames can affect updated_at on an older database trigger.
      for (const project of data.projects) {
        queries.push(
          tx.query(
            `INSERT INTO local_project_updates (local_id)
             SELECT mapping.local_id
             FROM local_project_map AS mapping
             JOIN projects AS target
               ON target.user_id = $1 AND target.id = mapping.target_id
             WHERE mapping.local_id = $2
               AND $3::timestamptz > target.updated_at`,
            [auth.userId, project.id, project.updatedAt],
          ),
        )
      }

      // Free every name that will be changed before applying final names, making rename chains input-order independent.
      const temporaryProjectNames = new Map(
        data.projects.map((project) => [project.id, `__local_merge_${randomUUID()}__`]),
      )
      for (const project of data.projects) {
        queries.push(
          tx.query(
            `UPDATE projects AS target
             SET name = $3
             FROM local_project_map AS mapping
             JOIN local_project_updates AS selected
               ON selected.local_id = mapping.local_id
             WHERE mapping.local_id = $2
               AND target.user_id = $1
               AND target.id = mapping.target_id
               AND target.name <> $4`,
            [
              auth.userId,
              project.id,
              temporaryProjectNames.get(project.id),
              project.name,
            ],
          ),
        )
      }

      // Apply final names and timestamps. Duplicate final names raise 23505 and roll back rather than losing identity.
      for (const project of data.projects) {
        queries.push(
          tx.query(
            `UPDATE projects AS target
             SET name = $3,
                 created_at = LEAST(target.created_at, $4::timestamptz),
                 updated_at = $5::timestamptz
             FROM local_project_map AS mapping
             JOIN local_project_updates AS selected
               ON selected.local_id = mapping.local_id
             WHERE mapping.local_id = $2
               AND target.user_id = $1
               AND target.id = mapping.target_id`,
            [auth.userId, project.id, project.name, project.createdAt, project.updatedAt],
          ),
        )
      }

      // Exact-ID renames above may have freed a name needed by a new local project.
      for (const project of data.projects) {
        queries.push(
          tx.query(
            `INSERT INTO projects (id, user_id, name, created_at, updated_at)
             SELECT mapping.target_id, $1, $3, $4::timestamptz, $5::timestamptz
             FROM local_project_map AS mapping
             WHERE mapping.local_id = $2
               AND NOT EXISTS (
                 SELECT 1 FROM projects AS target
                 WHERE target.user_id = $1 AND target.id = mapping.target_id
               )`,
            [auth.userId, project.id, project.name, project.createdAt, project.updatedAt],
          ),
        )
      }
    }

    for (const task of data.issues) {
      if (mode === 'overwrite') {
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
      } else {
        queries.push(
          tx.query(
            `INSERT INTO tasks (id, user_id, project_id, title, description, status, priority, due_date, created_at, updated_at)
             SELECT $2, $1, target_project.id, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz
             FROM local_project_map AS mapping
             JOIN projects AS target_project
               ON target_project.user_id = $1 AND target_project.id = mapping.target_id
             WHERE mapping.local_id = $3
             ON CONFLICT (user_id, id) DO UPDATE
             SET project_id = EXCLUDED.project_id,
                 title = EXCLUDED.title,
                 description = EXCLUDED.description,
                 status = EXCLUDED.status,
                 priority = EXCLUDED.priority,
                 due_date = EXCLUDED.due_date,
                 created_at = LEAST(tasks.created_at, EXCLUDED.created_at),
                 updated_at = EXCLUDED.updated_at
             WHERE EXCLUDED.updated_at > tasks.updated_at`,
            [
              auth.userId,
              task.id,
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
      }

      for (const history of task.histories) {
        if (mode === 'overwrite') {
          queries.push(
            tx.query(
              `INSERT INTO task_histories (id, user_id, task_id, action_date, content, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)`,
              [history.id, auth.userId, task.id, history.date, history.content, history.createdAt, history.updatedAt],
            ),
          )
          continue
        }

        queries.push(
          tx.query(
            `INSERT INTO task_histories (id, user_id, task_id, action_date, content, created_at, updated_at)
             VALUES ($2, $1, $3, $4, $5, $6::timestamptz, $7::timestamptz)
             ON CONFLICT (user_id, id) DO UPDATE
             SET task_id = EXCLUDED.task_id,
                 action_date = EXCLUDED.action_date,
                 content = EXCLUDED.content,
                 created_at = LEAST(task_histories.created_at, EXCLUDED.created_at),
                 updated_at = EXCLUDED.updated_at
             WHERE EXCLUDED.updated_at > task_histories.updated_at`,
            [auth.userId, history.id, task.id, history.date, history.content, history.createdAt, history.updatedAt],
          ),
        )
      }
    }
      return queries
    })
  } catch (err) {
    if (mode === 'merge' && getErrorCode(err) === '23505') {
      throw new ApiError(
        409,
        'merge_conflict',
        'プロジェクトのIDまたは名前が競合しています。ローカル側のプロジェクト名を変更するか、上書きを選択してください。',
      )
    }
    throw err
  }

  return json({ imported: true, mode })
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
  let rows = await database().query(
    `SELECT id, email, display_name FROM users WHERE firebase_uid = $1`,
    [firebaseUid],
  )
  if (rows.length) {
    const user = rows[0]
    if (user.email !== email || user.display_name !== displayName) {
      await database().query(
        `UPDATE users SET email = $2, display_name = $3 WHERE id = $1`,
        [user.id, email, displayName],
      )
    }
    return { userId: user.id, firebaseUid }
  }

  rows = await database().query(
    `INSERT INTO users (id, firebase_uid, email, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name
     RETURNING id`,
    [createId('user'), firebaseUid, email, displayName],
  )
  if (!rows.length) throw new ApiError(500, 'internal_error', 'Unable to resolve authenticated user')

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

function database(): NeonQueryFunction<false, false> {
  if (sql) return sql
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new ApiError(500, 'server_config_error', 'Database is not configured')
  sql = neon(databaseUrl)
  return sql
}

async function executeUserWrite(userId: string, query: string, params: unknown[]): Promise<any[]> {
  const results = await database().transaction((tx) => [
    tx.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]),
    tx.query(query, params),
  ])
  return results[1]
}

function readJson(event: HandlerEvent): unknown {
  const rawBody = event.body ?? ''
  const body = event.isBase64Encoded ? Buffer.from(rawBody, 'base64').toString('utf8') : rawBody
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    throw new ApiError(413, 'payload_too_large', 'Request body is too large')
  }
  if (!body) return {}
  try {
    return JSON.parse(body)
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
  const rows = await database().query(`SELECT id FROM projects WHERE user_id = $1 AND id = $2`, [userId, projectId])
  if (!rows.length) throw new ApiError(404, 'not_found', 'Project not found')
}

async function ensureTask(userId: string, taskId: string): Promise<void> {
  const rows = await database().query(`SELECT id FROM tasks WHERE user_id = $1 AND id = $2`, [userId, taskId])
  if (!rows.length) throw new ApiError(404, 'not_found', 'Task not found')
}

async function throwConflictOrNotFound(table: string, userId: string, id: string, taskId?: string): Promise<never> {
  const rows = await database().query(
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

function getErrorCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined
  const code = (err as Error & { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function sanitizeError(err: unknown): { name: string; code?: string } {
  if (!(err instanceof Error)) return { name: 'UnknownError' }
  const code = getErrorCode(err)
  return code ? { name: err.name, code } : { name: err.name }
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
