import { PageHeader } from '@/components/PageHeader';
import { UserManagementClient } from '@/components/UserManagementClient';

export const dynamic = 'force-dynamic';

export default function UserManagementPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrowKey="screens.settings"
        titleKey="screens.users"
        descriptionKey="screens.usersDescription"
      />

      <UserManagementClient />
    </section>
  );
}
