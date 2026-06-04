import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { canAccess, canAccessPlatform } from '@/lib/permissions';
import { isMissingAutomationEngineTables, mergeAutomationDefaults } from '@/lib/automation-engine';
import {
  AUTOMATION_TEST_SCENARIOS,
  SIMULATED_NOW_OPTIONS,
  getAutomationTestCenterConfig,
  runAutomationTestCenter
} from '@/lib/automation-test-center';

const canUseAutomationTestCenter = ({ role, platformRole }) => (
  canAccess(role, 'automations')
  || canAccessPlatform(platformRole, 'platform_console')
  || canAccessPlatform(platformRole, 'simulation')
);

const loadAutomations = async ({ supabase, hotelId }) => {
  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('hotel_id', hotelId);

  if (error) {
    if (isMissingAutomationEngineTables(error)) {
      return [];
    }

    throw error;
  }

  return mergeAutomationDefaults(data || []);
};

export async function GET(request) {
  try {
    const { hotel, role, platformRole } = await getCurrentHotelForRequest(request);

    if (!canUseAutomationTestCenter({ role, platformRole })) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId: hotel?.id || null,
      scenarios: AUTOMATION_TEST_SCENARIOS,
      simulatedNowOptions: SIMULATED_NOW_OPTIONS,
      latestTests: [],
      config: getAutomationTestCenterConfig()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        scenarios: AUTOMATION_TEST_SCENARIOS,
        config: getAutomationTestCenterConfig()
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { supabase, hotel, role, platformRole } = await getCurrentHotelForRequest(request);

    if (!canUseAutomationTestCenter({ role, platformRole })) {
      return NextResponse.json({ ok: false, error: 'Access denied' }, { status: 403 });
    }

    if (!hotel?.id) {
      return NextResponse.json({ ok: false, error: 'No active hotel available' }, { status: 400 });
    }

    const body = await request.json();
    const requestedHotelId = body?.hotelId || hotel.id;

    if (requestedHotelId !== hotel.id) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Automation Test Center must use the active hotel tenant.',
          activeHotelId: hotel.id,
          requestedHotelId
        },
        { status: 409 }
      );
    }

    const automations = await loadAutomations({
      supabase,
      hotelId: hotel.id
    });
    const result = runAutomationTestCenter({
      scenarioId: body?.scenario_id || body?.scenarioId || 'arriving_tomorrow',
      hotel,
      simulatedNow: body?.simulatedNow || 'now',
      customNow: body?.customNow || body?.custom_datetime || null,
      dryRun: body?.dryRun !== false,
      sendTest: Boolean(body?.sendTest),
      automations
    });

    return NextResponse.json({
      ok: true,
      hotel,
      hotelId: hotel.id,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        config: getAutomationTestCenterConfig()
      },
      { status: 500 }
    );
  }
}
