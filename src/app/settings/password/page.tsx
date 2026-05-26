import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { PasswordChangeForm } from '@/components/PasswordChangeForm'

export default async function PasswordSettingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/settings/password')
  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">비밀번호 변경</h1>
      <PasswordChangeForm forced={me.mustChangePassword === 1} />
    </div>
  )
}
