import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const jsonError = (message, status = 500) => NextResponse.json({
  hotel: null,
  role: 'admin',
  permissions: [],
  availableHotels: [],
  error: message
}, { status });

export async function GET(request) {
  try {
    const { hotel, hotelUser, role, permissions, availableHotels, fallback, user } = await getCurrentHotelForRequest(request);

    return NextResponse.json({
      hotel,
      hotelUser,
      role,
      permissions,
      availableHotels,
      fallback,
      user
    });
  } catch (error) {
    console.error('Current hotel API failed', error);
    return jsonError(error.message || 'Current hotel lookup failed');
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const hotelId = body.hotelId || null;
    const context = await getCurrentHotelForRequest(new Request(request.url, {
      headers: {
        authorization: request.headers.get('authorization') || '',
        'x-staynex-hotel-id': hotelId || ''
      }
    }));
    const allowed = context.availableHotels.some((item) => item.hotel?.id === hotelId);

    if (!hotelId || !allowed) {
      return jsonError('You do not have access to this hotel', 403);
    }

    const response = NextResponse.json({
      ok: true,
      hotel: context.hotel,
      hotelUser: context.hotelUser,
      role: context.role,
      permissions: context.permissions,
      availableHotels: context.availableHotels,
      fallback: context.fallback
    });

    response.cookies.set('staynex_active_hotel_id', hotelId, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365
    });

    return response;
  } catch (error) {
    console.error('Current hotel switch failed', error);
    return jsonError(error.message || 'Could not switch hotel');
  }
}
