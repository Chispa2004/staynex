import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { runDashboardAutomationScheduler } from '@/lib/automation-runner';
import {
  buildAutomationRunErrorResponse,
  handleAutomationRunPost
} from '@/lib/automation-run-api';
import { canAccess } from '@/lib/permissions';

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: 'automations-run'
  });
}

export async function POST(request) {
  try {
    const result = await handleAutomationRunPost({
      request,
      getCurrentHotelForRequest,
      runDashboardAutomationScheduler,
      canAccess
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Automation preview run failed', error);
    const failure = buildAutomationRunErrorResponse({
      status: 500,
      error: error.message,
      request
    });

    return NextResponse.json(failure.body, { status: failure.status });
  }
}
