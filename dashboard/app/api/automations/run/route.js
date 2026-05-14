import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { runAutomationScheduler } from '../../../../../src/services/scheduler.service.js';

export async function POST(request) {
  try {
    const { hotel } = await getCurrentHotelForRequest(request);

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

    const scheduledMessages = await runAutomationScheduler({
      hotelId: hotel.id
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
