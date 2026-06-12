import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { BOOKS_DOMAIN, DOMAIN_TYPES, GAMES_DOMAIN, MOVIES_DOMAIN } from '@/lib/domains/config'

const DOMAINS = [BOOKS_DOMAIN, MOVIES_DOMAIN, GAMES_DOMAIN]

describe('media domain config', () => {
  it('DOMAIN_TYPES와 도메인 type이 1:1', () => {
    expect(DOMAINS.map((d) => d.type).sort()).toEqual([...DOMAIN_TYPES].sort())
  })

  it('cols ref가 해당 테이블의 실제 컬럼을 가리킴', () => {
    for (const d of DOMAINS) {
      const tableCols = Object.values(getTableColumns(d.table))
      for (const [name, col] of Object.entries(d.cols)) {
        expect(tableCols, `${d.key}.cols.${name}`).toContain(col)
      }
    }
  })

  it('fields 이름이 테이블 컬럼 프로퍼티로 존재', () => {
    for (const d of DOMAINS) {
      const colNames = Object.keys(getTableColumns(d.table))
      expect(colNames).toContain(d.fields.person)
      expect(colNames).toContain(d.fields.date)
      expect(colNames).toContain(d.fields.externalId)
    }
  })

  it('cols.person/date/externalId가 fields 이름의 컬럼과 동일 ref', () => {
    for (const d of DOMAINS) {
      const tableCols = getTableColumns(d.table) as Record<string, unknown>
      expect(d.cols.person).toBe(tableCols[d.fields.person])
      expect(d.cols.date).toBe(tableCols[d.fields.date])
      expect(d.cols.externalId).toBe(tableCols[d.fields.externalId])
    }
  })

  it('junctionFk가 junctionFkField 프로퍼티와 동일 ref', () => {
    for (const d of DOMAINS) {
      const junctionCols = getTableColumns(d.junction) as Record<string, unknown>
      expect(d.junctionFk).toBe(junctionCols[d.junctionFkField])
    }
  })
})
