import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';

const getBackendUrl = () => (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3000'
);

const cleanText = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const requiredFields = [
  'guest_name',
  'guest_email',
  'guest_phone',
  'arrival_date',
  'departure_date',
  'room_type',
  'rate_plan',
  'board_basis'
];

const buildPmsPayload = ({ body, hotel }) => {
  const timestamp = Date.now();

  return {
    hotel_id: hotel?.id || null,
    pms_provider: 'demo_web_booking',
    pms_reservation_id: `DEMO-WEB-${timestamp}`,
    source: 'demo_web_booking',
    guest_name: cleanText(body.guest_name),
    guest_email: cleanText(body.guest_email),
    guest_phone: cleanText(body.guest_phone),
    arrival_date: cleanText(body.arrival_date),
    departure_date: cleanText(body.departure_date),
    adults: Number(body.adults || 1),
    children: Number(body.children || 0),
    room_type: cleanText(body.room_type),
    rate_plan: cleanText(body.rate_plan),
    board_basis: cleanText(body.board_basis),
    notes: cleanText(body.notes),
    status: 'confirmed'
  };
};

export async function POST(request) {
  try {
    const body = await request.json();
    const missingField = requiredFields.find((field) => !cleanText(body[field]));

    if (missingField) {
      return NextResponse.json({
        ok: false,
        error: `${missingField} is required`
      }, { status: 400 });
    }

    const { hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'reservations_manage')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }
    const payload = buildPmsPayload({ body, hotel });

    // This simulator intentionally enters through the same PMS webhook used by future providers.
    const response = await fetch(`${getBackendUrl()}/webhooks/pms/reservation-created`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        error: result.error || 'Could not create test reservation'
      }, { status: response.status });
    }

    return NextResponse.json({
      ok: true,
      hotel,
      reservation: result.reservation,
      automation_events: result.automation_events || []
    });
  } catch (error) {
    console.error('Create test reservation failed', error);

    return NextResponse.json({
      ok: false,
      error: error.message || 'Create test reservation failed'
    }, { status: 500 });
  }
}
