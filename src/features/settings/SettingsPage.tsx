import { Card } from '../../components/ui'
import { BackupRestoreSection } from './BackupRestoreSection'
import { BusinessInfoSection } from './BusinessInfoSection'
import { UsersSection } from './UsersSection'

export function SettingsPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[900px] flex-1 flex-col gap-md overflow-y-auto pb-md">
      <h1 className="text-headline-lg text-on-surface">Settings &amp; Support</h1>

      <BusinessInfoSection />
      <UsersSection />
      <BackupRestoreSection />

      <Card padding="md" className="flex flex-col gap-xs">
        <h2 className="text-headline-md text-on-surface">Support</h2>
        <p className="text-body-md text-on-surface-variant">
          Having trouble with the register, menu, or inventory? Contact your system administrator.
        </p>
      </Card>
    </div>
  )
}
