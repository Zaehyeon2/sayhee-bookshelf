import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const url = process.env.TURSO_URL
if (!url) throw new Error('TURSO_URL is not set')

const libsql = createClient({
  url,
  authToken: process.env.TURSO_TOKEN || undefined,
})

export const db = drizzle(libsql, { schema })
