import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';

const starterEntries = [
  { key: 'desayuno', title: 'Breakfast', category: 'food', value: 'Breakfast is served from 07:30 to 10:30.' },
  { key: 'wifi', title: 'WiFi', category: 'connectivity', value: 'WiFi network: StaynexGuest. Password: staynex2026.' },
  { key: 'checkout', title: 'Checkout', category: 'policy', value: 'Standard checkout is at 12:00.' },
  { key: 'parking', title: 'Parking', category: 'transport', value: 'Parking is available for 18 EUR per day.' },
  { key: 'spa', title: 'Spa', category: 'wellness', value: 'The spa is open from 10:00 to 20:00.' },
  { key: 'piscina', title: 'Pool', category: 'amenities', value: 'The pool is open from 10:00 to 19:00.' },
  { key: 'restaurante', title: 'Restaurant', category: 'food', value: 'Dinner is served from 19:30 to 23:00.' },
  { key: 'room_service', title: 'Room service', category: 'food', value: 'Room service is available from 12:00 to 23:00.' }
];

export async function POST(request) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);
    const records = starterEntries.map((entry) => ({
      ...entry,
      hotel_id: hotel.id,
      is_active: true,
      updated_at: new Date().toISOString()
    }));

    const { data: existing, error: existingError } = await supabase
      .from('hotel_knowledge')
      .select('id, key')
      .eq('hotel_id', hotel.id)
      .in('key', records.map((entry) => entry.key));

    if (existingError) {
      throw existingError;
    }

    const existingByKey = new Map((existing || []).map((entry) => [entry.key, entry]));
    const savedEntries = [];

    for (const record of records) {
      const existingEntry = existingByKey.get(record.key);
      const query = existingEntry
        ? supabase.from('hotel_knowledge').update(record).eq('id', existingEntry.id).select('*').single()
        : supabase.from('hotel_knowledge').insert(record).select('*').single();
      const { data, error } = await query;

      if (error) {
        throw error;
      }

      savedEntries.push(data);
    }

    return NextResponse.json({
      ok: true,
      entries: savedEntries,
      count: savedEntries.length
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Could not generate starter knowledge base'
    }, { status: 400 });
  }
}
