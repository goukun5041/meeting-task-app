import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const sql = neon(databaseUrl)
const migration = await readFile(join(process.cwd(), 'migrations', '001_init.sql'), 'utf8')
await sql.query(migration)
console.log('Migrations completed')
