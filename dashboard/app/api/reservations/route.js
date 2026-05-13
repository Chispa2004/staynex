import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('reservations')
      .select('*, automation_events(*)')
      .order('arrival_date', { ascending: true, nullsFirst: false })
      .limit(100);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      reservations: data || []
    });
  } catch (error) {
    return NextResponse.json(
      {
        reservations: [],
        error: error.message
      },
      { status: 500 }
    );
  }
}
