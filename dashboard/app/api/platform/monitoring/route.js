import { NextResponse } from 'next/server';
import { getPlatformContext, writePlatformAuditLog } from '@/lib/platform';
import { canAccessPlatform } from '@/lib/permissions';
import { getPlatformMonitoring } from '@/lib/system-health';

const noStore = {
  headers: {
    'Cache-Control': 'no-store'
  }
};

export async function GET(request) {
  try {
    const { supabase, platformRole } = await getPlatformContext(request, { requireAdmin: true });

    if (!canAccessPlatform(platformRole, 'platform_monitoring')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const monitoring = await getPlatformMonitoring({ supabase });

    return NextResponse.json({
      ok: true,
      platformRole,
      monitoring
    }, noStore);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Platform monitoring could not be loaded'
    }, { status: error.status || 500, ...noStore });
  }
}

const readJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};

const incrementRetryMetadata = (metadata = {}, actor = null) => {
  const now = new Date().toISOString();
  const retryCount = Number(metadata.provider_email_retry_count || 0) + 1;

  return {
    ...metadata,
    provider_email_retry_status: 'queued',
    provider_email_status: metadata.provider_email_status === 'sent' ? 'sent' : 'pending_retry',
    provider_email_retry_count: retryCount,
    provider_email_last_retry_at: now,
    provider_email_retry_requested_at: now,
    provider_email_retry_requested_by: actor?.email || actor?.id || null,
    provider_response_status: metadata.provider_response_status || 'pending'
  };
};

export async function POST(request) {
  try {
    const { supabase, platformRole, user, role } = await getPlatformContext(request, { requireAdmin: true });

    if (!canAccessPlatform(platformRole, 'platform_monitoring')) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403, ...noStore });
    }

    const body = await readJson(request);
    const action = body.action;
    const id = body.id;

    if (!action) {
      return NextResponse.json({ ok: false, error: 'Action is required' }, { status: 400, ...noStore });
    }

    if (action === 'retry_provider_email') {
      if (!id) {
        return NextResponse.json({ ok: false, error: 'Booking request id is required' }, { status: 400, ...noStore });
      }

      const { data: booking, error: bookingError } = await supabase
        .from('experience_booking_requests')
        .select('*')
        .eq('id', id)
        .limit(1)
        .maybeSingle();

      if (bookingError) {
        throw bookingError;
      }

      if (!booking) {
        return NextResponse.json({ ok: false, error: 'Provider booking not found' }, { status: 404, ...noStore });
      }

      if (booking.metadata?.provider_email_sent || booking.metadata?.provider_email_status === 'sent') {
        return NextResponse.json({ ok: false, error: 'Provider email already sent' }, { status: 409, ...noStore });
      }

      const metadata = incrementRetryMetadata(booking.metadata || {}, user);
      let { data, error } = await supabase
        .from('experience_booking_requests')
        .update({
          metadata,
          lead_status: 'pending_retry',
          lead_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error && (error.message?.includes('lead_status') || error.details?.includes('lead_status'))) {
        const fallback = await supabase
          .from('experience_booking_requests')
          .update({
            metadata,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select('*')
          .single();

        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        role,
        action: 'provider_email_retry_queued',
        hotelId: booking.hotel_id,
        metadata: {
          booking_request_id: id,
          retry_count: metadata.provider_email_retry_count,
          source: 'platform_monitoring'
        }
      });

      return NextResponse.json({
        ok: true,
        action,
        status: 'queued',
        retryCount: metadata.provider_email_retry_count,
        booking: data
      }, noStore);
    }

    if (action === 'retry_automation') {
      if (!id) {
        return NextResponse.json({ ok: false, error: 'Scheduled message id is required' }, { status: 400, ...noStore });
      }

      const { data, error } = await supabase
        .from('scheduled_messages')
        .update({
          status: 'retry',
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        role,
        action: 'automation_retry_queued',
        hotelId: data?.hotel_id || null,
        metadata: { scheduled_message_id: id, source: 'platform_monitoring' }
      });

      return NextResponse.json({ ok: true, action, status: 'queued', scheduledMessage: data }, noStore);
    }

    if (action === 'rerun_health_check' || action === 'mark_resolved' || action === 'ignore_warning' || action === 'retry_webhook') {
      await writePlatformAuditLog({
        supabase,
        actor: user,
        platformRole,
        role,
        action,
        hotelId: body.hotelId || null,
        metadata: {
          id: id || null,
          source: 'platform_monitoring',
          note: body.note || null
        }
      });

      return NextResponse.json({ ok: true, action, status: 'recorded' }, noStore);
    }

    return NextResponse.json({ ok: false, error: 'Unsupported monitoring action' }, { status: 400, ...noStore });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || 'Platform monitoring action failed'
    }, { status: error.status || 500, ...noStore });
  }
}
