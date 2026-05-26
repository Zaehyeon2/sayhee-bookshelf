import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const url = process.env.TURSO_URL
if (!url) throw new Error('TURSO_URL is not set')

const libsql = createClient({
  url,
  authToken: process.env.TURSO_TOKEN || undefined,
})

// SQLite ignores foreign keys by default. Turso (server) enables them, but local
// file: URLs don't — explicitly turn them on so ON DELETE CASCADE works.
// Fire-and-forget; libsql serializes statements on a single client.
libsql.execute('PRAGMA foreign_keys = ON').catch(() => {})

export const db = drizzle(libsql, { schema })
