import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const url = process.env.TURSO_URL
if (!url) throw new Error('TURSO_URL is not set')

const libsql = createClient({
  url,
  authToken: process.env.TURSO_TOKEN || undefined,
})

// SQLite ignores foreign keys by default. Turso (server)는 enable 상태지만 local file: URL은
// 아니므로 명시적으로 켠다. Module load 시점에 한 번 실행되고, libsql client는 statement를
// 직렬화하므로 이후 쿼리는 PRAGMA 적용 이후 실행된다. 이 await을 module top-level에서 수행해
// import 시점에 보장한다.
await libsql.execute('PRAGMA foreign_keys = ON')

export const db = drizzle(libsql, { schema })
