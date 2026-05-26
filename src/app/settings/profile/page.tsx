import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { ProfileForm } from '@/components/ProfileForm'

export default async function ProfileSettingsPage() {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/settings/profile')
  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">프로필 변경</h1>
      <p className="text-[13px] text-[var(--color-text-muted)]">
        서재 제목과 화면에 표시되는 이름입니다.
      </p>
      <ProfileForm initialDisplayName={me.displayName} />
    </div>
  )
}
