import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Client } from '@neondatabase/serverless'

export async function runMigrations({
  client,
  migrationsDirectory = join(process.cwd(), 'migrations'),
  logger = console,
}) {
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
    .sort((left, right) => left.localeCompare(right))

  if (!migrationFiles.length) {
    throw new Error(`No migration files found in ${migrationsDirectory}`)
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  for (const fileName of migrationFiles) {
    const migration = (await readFile(join(migrationsDirectory, fileName), 'utf8'))
      .replace(/\r\n?/g, '\n')
    const checksum = createHash('sha256').update(migration).digest('hex')

    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('meeting-task-app:migrations'))",
      )
      const applied = await client.query(
        `SELECT checksum FROM schema_migrations WHERE name = $1`,
        [fileName],
      )

      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration was modified: ${fileName}`)
        }
        await client.query('COMMIT')
        logger.log(`Skipped ${fileName}`)
        continue
      }

      // No parameters intentionally: PostgreSQL's simple query protocol supports
      // migration files containing multiple SQL commands.
      await client.query(migration)
      await client.query(
        `INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)`,
        [fileName, checksum],
      )
      await client.query('COMMIT')
      logger.log(`Applied ${fileName}`)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  }

  logger.log('Migrations completed')
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await runMigrations({ client })
  } finally {
    await client.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
