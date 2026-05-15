import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { runDashboardAutomationScheduler } from '@/lib/automation-runner';
import { canAccess } from '@/lib/permissions';

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: 'automations-run'
  });
}

export async function POST(request) {
  try {
    const { supabase, hotel, role } = await getCurrentHotelForRequest(request);

    if (!canAccess(role, 'automations')) {
      return NextResponse.json({ ok: false, scheduled: 0, error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json(
        {
          ok: false,
          scheduled: 0,
          error: 'No hotel available for scheduler'
        },
        { status: 400 }
      );
    }

    const scheduledMessages = await runDashboardAutomationScheduler({
      supabase,
      hotel
    });

    return NextResponse.json({
      ok: true,
      hotel,
      scheduled: scheduledMessages.length,
      scheduledMessages
    });
  } catch (error) {
    console.error('Automation scheduler run failed', error);

    return NextResponse.json(
      {
        ok: false,
        scheduled: 0,
        error: error.message
      },
      { status: 500 }
    );
  }
}
