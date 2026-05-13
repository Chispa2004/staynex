import { NextResponse } from 'next/server';
import { cleanDemoData } from '@/lib/demo';

export async function DELETE() {
  try {
    const result = await cleanDemoData();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
