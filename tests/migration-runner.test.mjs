import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '../scripts/run-migrations.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('runMigrations', () => {
  it('executes a multi-command migration without prepared-statement parameters', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'meeting-task-migrations-'))
    temporaryDirectories.push(directory)
    const migration = 'CREATE TABLE first_table (id TEXT);\nCREATE TABLE second_table (id TEXT);\n'
    await writeFile(join(directory, '001_init.sql'), migration)

    const calls = []
    const client = {
      async query(text, values) {
        calls.push({ text, values })
        if (text.includes('SELECT checksum')) return { rows: [] }
        return { rows: [] }
      },
    }

    await runMigrations({ client, migrationsDirectory: directory, logger: { log() {} } })

    const migrationCall = calls.find(({ text }) => text === migration)
    expect(migrationCall).toBeDefined()
    expect(migrationCall?.values).toBeUndefined()
    expect(calls.map(({ text }) => text.trim())).toEqual([
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'),
      'BEGIN',
      "SELECT pg_advisory_xact_lock(hashtext('meeting-task-app:migrations'))",
      expect.stringContaining('SELECT checksum'),
      migration.trim(),
      expect.stringContaining('INSERT INTO schema_migrations'),
      'COMMIT',
    ])
  })
})
