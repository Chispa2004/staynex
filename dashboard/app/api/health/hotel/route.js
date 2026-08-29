import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess } from '@/lib/permissions';
import { writeEnterpriseAuditLog } from '@/lib/enterprise-audit';
import { canModifyPilotProtectedConfig } from '@/lib/pilot-onboarding';
import { getHotelOperationalHealth } from '@/lib/system-health';
import {
  HOTEL_AI_AUTO_REPLY_METADATA_KEY,
  getHotelAiAutoReplyStatus,
  getPilotAiSafetyReadiness,
  safePilotMetadata
} from '../../../../../shared/pilot/ai-safety.js';

const noStore = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

export async function GET(request) {
  try {
    const { supabase, hotel, role, fallback, accessDenied } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!canAccess(role, 'hotel_health')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const health = await getHotelOperationalHealth({
      supabase,
      hotelId: hotel.id,
      hotel
    });
    const pilotAiSafety = getPilotAiSafetyReadiness({
      hotel,
      env: process.env
    });

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId: hotel.id,
      role,
      health,
      pilotAiSafety
    }, noStore);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Hotel health could not be loaded'
    }, { status: 500, ...noStore });
  }
}

export async function PATCH(request) {
  try {
    const {
      supabase,
      hotel,
      role,
      platformRole,
      fallback,
      accessDenied,
      user
    } = await getCurrentHotelForRequest(request);

    if (accessDenied || !hotel?.id || fallback) {
      return NextResponse.json({ ok: false, error: 'Workspace is not available' }, { status: 403, ...noStore });
    }

    if (!canModifyPilotProtectedConfig({ role, platformRole, fallback })) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const body = await request.json().catch(() => ({}));

    if (body.action !== 'set_ai_auto_reply') {
      return NextResponse.json({ ok: false, error: 'Unsupported health action' }, { status: 400, ...noStore });
    }

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'enabled must be true or false' }, { status: 400, ...noStore });
    }

    const now = new Date().toISOString();
    const previousStatus = getHotelAiAutoReplyStatus(hotel);
    const metadata = safePilotMetadata(hotel.metadata);
    const nextMetadata = {
      ...metadata,
      [HOTEL_AI_AUTO_REPLY_METADATA_KEY]: body.enabled,
      pilot_kill_switch_configured: true,
      pilot_kill_switch_last_changed_at: now,
      pilot_kill_switch_last_changed_by: user?.id || null
    };

    const { data: updatedHotel, error: updateError } = await supabase
      .from('hotels')
      .update({
        metadata: nextMetadata,
        updated_at: now
      })
      .eq('id', hotel.id)
      .select('*')
      .single();

    if (updateError) {
      throw updateError;
    }

    const nextStatus = getHotelAiAutoReplyStatus(updatedHotel);

    await writeEnterpriseAuditLog({
      supabase,
      request,
      actor: user?.id ? { id: user.id } : null,
      actorRole: role,
      actorPlatformRole: platformRole,
      hotelId: hotel.id,
      action: body.enabled ? 'hotel_ai_kill_switched_on' : 'hotel_ai_kill_switched_off',
      entityType: 'hotel_ai_kill_switch',
      entityId: hotel.id,
      oldValues: {
        ai_auto_reply_enabled: previousStatus.enabled,
        configured: previousStatus.configured
      },
      newValues: {
        ai_auto_reply_enabled: nextStatus.enabled,
        configured: nextStatus.configured
      },
      metadata: {
        event_type: body.enabled ? 'hotel_ai_kill_switched_on' : 'hotel_ai_kill_switched_off',
        hotel_id: hotel.id,
        source: nextStatus.source
      }
    });

    return NextResponse.json({
      ok: true,
      hotel: updatedHotel,
      hotelId: updatedHotel.id,
      role,
      pilotAiSafety: getPilotAiSafetyReadiness({
        hotel: updatedHotel,
        env: process.env
      })
    }, noStore);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Hotel AI auto-reply could not be updated'
    }, { status: 500, ...noStore });
  }
}
