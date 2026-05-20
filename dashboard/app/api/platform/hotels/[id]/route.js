import { NextResponse } from 'next/server';
import {
  archiveHotelWorkspace,
  getHotelPlatformDetail,
  getPlatformContext,
  writePlatformAuditLog
} from '@/lib/platform';

export const dynamic = 'force-dynamic';

const roleValues = ['owner', 'admin', 'manager', 'receptionist', 'housekeeping', 'maintenance', 'analyst'];
const statusValues = ['active', 'invited', 'disabled'];

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, user, platformRole, platformPermissions } = await getPlatformContext(request);
    const detail = await getHotelPlatformDetail(supabase, id);

    await writePlatformAuditLog({
      supabase,
      actor: user,
      platformRole,
      action: 'hotel_viewed',
      hotelId: id,
      metadata: {
        hotel_name: detail.hotel?.name || null,
        source: 'platform_hotel_detail'
      }
    });

    return NextResponse.json({
      ...detail,
      platformRole,
      platformPermissions
    }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not load hotel detail'
    }, { status: error.status || 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json();
    const action = body.action;

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    if (['disable_user', 'reset_invitation', 'update_user_role'].includes(action)) {
      if (!body.hotelUserId) {
        return NextResponse.json({ error: 'Hotel user id is required' }, { status: 400 });
      }

      const { data: hotelUser, error: lookupError } = await supabase
        .from('hotel_users')
        .select('*')
        .eq('id', body.hotelUserId)
        .eq('hotel_id', id)
        .single();

      if (lookupError) {
        throw lookupError;
      }

      const updates = { updated_at: new Date().toISOString() };

      if (action === 'disable_user') {
        updates.status = 'disabled';
      }

      if (action === 'reset_invitation') {
        updates.status = 'invited';
        updates.invited_at = new Date().toISOString();
        updates.accepted_at = null;
        updates.user_id = null;
      }

      if (action === 'update_user_role') {
        if (!roleValues.includes(body.role)) {
          return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }

        updates.role = body.role;
      }

      if (body.status && statusValues.includes(body.status)) {
        updates.status = body.status;
      }

      const { data: updatedUser, error: updateError } = await supabase
        .from('hotel_users')
        .update(updates)
        .eq('id', body.hotelUserId)
        .eq('hotel_id', id)
        .select('*')
        .single();

      if (updateError) {
        throw updateError;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action,
        hotelId: id,
        targetUserId: hotelUser.user_id,
        targetEmail: hotelUser.email,
        metadata: {
          previous_role: hotelUser.role,
          new_role: updatedUser.role,
          previous_status: hotelUser.status,
          new_status: updatedUser.status
        }
      });

      return NextResponse.json({ ok: true, hotelUser: updatedUser });
    }

    if (action === 'force_onboarding_state') {
      const now = new Date().toISOString();
      const { data: state, error } = await supabase
        .from('hotel_onboarding_state')
        .upsert({
          hotel_id: id,
          current_step: 'hotel_setup',
          completed_steps: [],
          onboarding_completed: false,
          updated_at: now
        }, { onConflict: 'hotel_id' })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        action: 'onboarding_forced',
        hotelId: id
      });

      return NextResponse.json({ ok: true, state });
    }

    return NextResponse.json({ error: 'Unsupported platform action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not update hotel operations state'
    }, { status: error.status || 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json().catch(() => ({}));

    const result = await archiveHotelWorkspace({
      supabase,
      hotelId: id,
      actor: user,
      platformRole,
      confirm: body.confirm === true
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message || 'Could not delete hotel workspace'
    }, { status: error.status || 500 });
  }
}
