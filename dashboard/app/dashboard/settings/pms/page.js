import { AppShell } from '@/components/AppShell';
import { PmsConnectionsClient } from '@/components/PmsConnectionsClient';

export default function PmsSettingsPage() {
  return (
    <AppShell>
      <PmsConnectionsClient />
    </AppShell>
  );
}
