import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { createHotelAtomically } from '@/lib/hotel-creation';
import { readHotelJson } from '../../../../shared/onboarding/hotel-fields.js';

export async function POST(request) {
  try {
    const context = await getCurrentHotelForRequest(request);
    const { supabase, user } = context;
    if (!context.canCreateWorkspaces || !user?.id || !user?.email) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const body = await readHotelJson(request);
    const result = await createHotelAtomically({supabase,user,body,key:request.headers.get('Idempotency-Key'),mode:'workspace'});
    return NextResponse.json(result, {status:result.replayed ? 200 : 201});
  } catch (error) {
    return NextResponse.json({error:error.message || 'No se pudo confirmar el alta.',fields:error.fields}, {status:error.status || 500});
  }
}
