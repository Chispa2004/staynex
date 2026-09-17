import { NextResponse } from 'next/server';
import { getOrganizationPrincipal, loadOrganizationDirectory, accessError } from '@/lib/organization-access';

const options = { headers: { 'Cache-Control': 'no-store' } };
export async function GET(request) {
  try {
    const principal = await getOrganizationPrincipal(request);
    const url = new URL(request.url);
    if (url.searchParams.get('platform') === '1' && !['super_admin','platform_admin','internal_only'].includes(principal.platformRole)) throw accessError('Platform is internal');
    const directory = await loadOrganizationDirectory(principal, url.searchParams.get('organizationId'));
    return NextResponse.json({ ...directory, platformRole: principal.platformRole,
      canManage: ['super_admin','platform_admin'].includes(principal.platformRole) }, options);
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'No se pudo cargar el directorio' }, { ...options, status: error.status || 503 });
  }
}
export async function POST(request) {
  try {
    const principal = await getOrganizationPrincipal(request);
    if (!['super_admin','platform_admin'].includes(principal.platformRole)) throw accessError('Staynex administrator required');
    const { action, payload } = await request.json();
    // Actor always comes from verified Auth. Never accept an impersonated actor.
    const { data, error } = await principal.supabase.rpc('staynex_manage_organization', {
      p_actor: principal.user.id, p_action: action, p_payload: payload
    });
    if (error) throw accessError(error.message, 400);
    return NextResponse.json({ result: data }, options);
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'No se pudo guardar la organización' }, { ...options, status: error.status || 503 });
  }
}
