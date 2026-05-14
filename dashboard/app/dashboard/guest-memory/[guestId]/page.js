import { GuestAiProfileClient } from '@/components/GuestAiProfileClient';

export const dynamic = 'force-dynamic';

export default async function GuestAiProfilePage({ params }) {
  const { guestId } = await params;

  return <GuestAiProfileClient guestId={guestId} />;
}
