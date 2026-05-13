import { NextResponse } from 'next/server';
import { getDemoStats } from '@/lib/demo';

export async function GET() {
  try {
    const stats = await getDemoStats();
    return NextResponse.json({ stats });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
