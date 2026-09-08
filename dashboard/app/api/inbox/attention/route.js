import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { handleAttentionRequest } from '@/lib/message-attention';

export async function POST(request) {
  const result = await handleAttentionRequest({ request, getContext:getCurrentHotelForRequest });
  return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
}
