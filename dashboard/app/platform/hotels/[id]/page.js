import { PlatformHotelDetailClient } from '@/components/PlatformHotelDetailClient';

export const dynamic = 'force-dynamic';

export default async function PlatformHotelDetailPage({ params }) {
  const { id } = await params;

  return <PlatformHotelDetailClient hotelId={id} />;
}
