import { eq, inArray } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { tags } from '@/lib/db/schema'
import type { Db, Tx } from '@/lib/db/queries/shared'

/**
 * junction 테이블 + FK 컬럼 ref 묶음.
 * books/writings/movies/games 4도메인 모두 사용하므로 미디어 3도메인에 한정하지 않는다.
 */
export interface TagJunctionRef {
  junction: SQLiteTable
  fk: SQLiteColumn
  tagId: SQLiteColumn
}

export async function attachTagsGeneric(
  db: Db,
  ref: TagJunctionRef,
  entityId: number,
): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(ref.junction)
    .innerJoin(tags, eq(ref.tagId, tags.id))
    .where(eq(ref.fk, entityId))
  return rows.map((r) => r.name)
}

export async function attachTagsBatchGeneric(
  db: Db,
  ref: TagJunctionRef,
  entityIds: number[],
): Promise<Map<number, string[]>> {
  if (entityIds.length === 0) return new Map()
  const rows = await db
    .select({ entityId: ref.fk, name: tags.name })
    .from(ref.junction)
    .innerJoin(tags, eq(ref.tagId, tags.id))
    .where(inArray(ref.fk, entityIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const id = r.entityId as number
    const existing = map.get(id) ?? []
    existing.push(r.name as string)
    map.set(id, existing)
  }
  return map
}

export async function replaceTagsTxGeneric(
  tx: Tx,
  ref: TagJunctionRef,
  entityId: number,
  tagNames: string[],
  deps: {
    getOrCreate: (tx: Tx, names: string[]) => Promise<number[]>
    buildRows: (entityId: number, tagIds: number[]) => Record<string, number>[]
  },
): Promise<void> {
  await tx.delete(ref.junction).where(eq(ref.fk, entityId))
  if (tagNames.length === 0) return
  const tagIds = await deps.getOrCreate(tx, tagNames)
  // biome-ignore lint/suspicious/noExplicitAny: drizzle 동적 테이블 insert — buildRows가 키 정합성 보증
  await (tx.insert(ref.junction as any) as any).values(deps.buildRows(entityId, tagIds))
}
