import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const jsonError = (message, status = 500) => NextResponse.json({
  hotel: null,
  role: 'admin',
  error: message
}, { status });

export async function GET(request) {
  try {
    const { hotel, role, fallback } = await getCurrentHotelForRequest(request);

    return NextResponse.json({
      hotel,
      role,
      fallback
    });
  } catch (error) {
    console.error('Current hotel API failed', error);
    return jsonError(error.message || 'Current hotel lookup failed');
  }
}
