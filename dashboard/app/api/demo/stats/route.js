import { NextResponse } from 'next/server';
import { getDemoStats } from '@/lib/demo';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function GET(request) {
  try {
    const stats = await getDemoStats(request);
    return NextResponse.json({ stats, hotelId: stats.hotelId || null }, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, ...jsonOptions }
    );
  }
}
