import { useState } from 'react'
import { Shield } from 'lucide-react'
import MembersTable from './MembersTable'
import AllowlistEditor from './AllowlistEditor'
import { useAuthStore } from '../../stores/authStore'

type Tab = 'members' | 'allowlist'

export default function AdminPanel() {
  const isAdmin = useAuthStore((s) => s.profile?.is_admin === true)
  const [tab, setTab] = useState<Tab>('members')

  if (!isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-500">
        <Shield className="h-8 w-8" />
        <span className="text-sm">Admin only.</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-ink-300" />
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">Admin</h1>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink/10 bg-ink/[0.03] p-0.5">
          <TabButton active={tab === 'members'} onClick={() => setTab('members')}>Members</TabButton>
          <TabButton active={tab === 'allowlist'} onClick={() => setTab('allowlist')}>Allowlist</TabButton>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'members' ? <MembersTable /> : <AllowlistEditor />}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
        active ? 'bg-ink/10 text-ink-100' : 'text-ink-400 hover:text-ink-200'
      }`}
    >
      {children}
    </button>
  )
}
