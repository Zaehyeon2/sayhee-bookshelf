import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users, books } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/auth'
import { UserAdminTable } from '@/components/UserAdminTable'

export default async function AdminUsersPage() {
  const me = await getCurrentUser()
  if (!me || me.role !== 'admin') notFound()

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      createdAt: users.createdAt,
      bookCount: sql<number>`(SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${users.id})`,
    })
    .from(users)
    .orderBy(users.createdAt)

  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">사용자 관리</h1>
      <UserAdminTable
        users={rows.map((r) => ({ ...r, bookCount: Number(r.bookCount) }))}
        currentAdminId={me.id}
      />
    </div>
  )
}
