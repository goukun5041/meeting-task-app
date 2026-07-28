import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const sql = neon(databaseUrl)
const migrationsDirectory = join(process.cwd(), 'migrations')
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
  .sort((left, right) => left.localeCompare(right))

if (!migrationFiles.length) {
  throw new Error(`No migration files found in ${migrationsDirectory}`)
}

await sql.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)

await sql.query(`
  CREATE OR REPLACE FUNCTION apply_meeting_task_migration(
    migration_name TEXT,
    migration_checksum TEXT,
    migration_sql TEXT
  ) RETURNS TEXT
  LANGUAGE plpgsql
  AS $$
  DECLARE
    recorded_checksum TEXT;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('meeting-task-app:migrations'));

    SELECT checksum INTO recorded_checksum
    FROM schema_migrations
    WHERE name = migration_name;

    IF FOUND THEN
      IF recorded_checksum <> migration_checksum THEN
        RAISE EXCEPTION 'Applied migration was modified: %', migration_name;
      END IF;
      RETURN 'skipped';
    END IF;

    EXECUTE migration_sql;
    INSERT INTO schema_migrations (name, checksum)
    VALUES (migration_name, migration_checksum);
    RETURN 'applied';
  END;
  $$;

  REVOKE ALL ON FUNCTION apply_meeting_task_migration(TEXT, TEXT, TEXT) FROM PUBLIC;
`)

for (const fileName of migrationFiles) {
  const migration = (await readFile(join(migrationsDirectory, fileName), 'utf8'))
    .replace(/\r\n?/g, '\n')
  const checksum = createHash('sha256').update(migration).digest('hex')
  const rows = await sql.query(
    `SELECT apply_meeting_task_migration($1, $2, $3) AS result`,
    [fileName, checksum, migration],
  )
  const result = rows[0]?.result
  if (result !== 'applied' && result !== 'skipped') {
    throw new Error(`Unexpected migration result for ${fileName}`)
  }
  console.log(`${result === 'applied' ? 'Applied' : 'Skipped'} ${fileName}`)
}

console.log('Migrations completed')
