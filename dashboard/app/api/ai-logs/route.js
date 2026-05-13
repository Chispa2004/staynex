import { NextResponse } from 'next/server';
import { getBackendUrl } from '@/lib/demo';

export async function GET() {
  try {
    const response = await fetch(`${getBackendUrl()}/debug/ai-logs`, {
      cache: 'no-store'
    });
    const payload = await response.json();

    return NextResponse.json(payload, {
      status: response.status
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
