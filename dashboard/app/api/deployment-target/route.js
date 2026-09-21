import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
// A project reference is public configuration, never a credential. This reads the
// exact server variable used by getSupabaseAdmin; no database/Auth calls or writes.
export async function GET() {
  let projectRef = null;
  try {
    const host = new URL(process.env.SUPABASE_URL).hostname;
    projectRef = /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1] || null;
  } catch {}
  return NextResponse.json({ projectRef }, {
    status: projectRef ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' }
  });
}
