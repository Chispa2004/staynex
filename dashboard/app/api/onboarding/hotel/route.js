import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const allowedFields = [
  'name',
  'brand_name',
  'timezone',
  'default_language',
  'check_in_time',
  'check_out_time',
  'address',
  'phone',
  'whatsapp_number',
  'description'
];

const cleanText = (value) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

export async function PATCH(request) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);
    const body = await request.json().catch(() => ({}));
    const updates = allowedFields.reduce((payload, field) => {
      if (body[field] !== undefined) {
        payload[field] = cleanText(body[field]);
      }

      return payload;
    }, {
      updated_at: new Date().toISOString()
    });

    if (!updates.name) {
      delete updates.name;
    }

    const { data, error } = await supabase
      .from('hotels')
      .update(updates)
      .eq('id', hotel.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      hotel: data
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not update hotel setup'
    }, { status: 400 });
  }
}
