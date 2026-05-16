import { NextResponse } from 'next/server';
import {
  getExperienceBookings,
  updateExperienceBooking
} from '@/lib/experience-bookings';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function GET(request) {
  try {
    const result = await getExperienceBookings(request);

    return NextResponse.json(result, jsonOptions);
  } catch (error) {
    return NextResponse.json({
      bookings: [],
      error: error.message || 'Could not load experience bookings'
    }, { status: error.status || 500, ...jsonOptions });
  }
}

export async function PATCH(request) {
  try {
    const booking = await updateExperienceBooking(request, await request.json());

    return NextResponse.json({ booking }, jsonOptions);
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not update experience booking'
    }, { status: error.status || 500, ...jsonOptions });
  }
}
