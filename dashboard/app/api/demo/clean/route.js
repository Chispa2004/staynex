import { NextResponse } from 'next/server';
import { cleanDemoData } from '@/lib/demo';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

export async function DELETE(request) {
  try {
    const result = await cleanDemoData(request);
    return NextResponse.json(result, jsonOptions);
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, ...jsonOptions }
    );
  }
}
