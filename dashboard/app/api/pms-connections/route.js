import { NextResponse } from 'next/server';
import { getCurrentHotelForRequest } from '@/lib/current-hotel';
import { PMS_PROVIDERS, getProviderWebhookUrl, redactConnection, saveConnection } from '@/lib/pms-connections';

const jsonError = (message, status = 500, extra = {}) => NextResponse.json({
  ok: false,
  error: message,
  ...extra
}, { status });

export async function GET(request) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);
    const { data, error } = await supabase
      .from('hotel_pms_connections')
      .select('*')
      .eq('hotel_id', hotel.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      hotel,
      providers: PMS_PROVIDERS.map((provider) => ({
        ...provider,
        webhookUrl: getProviderWebhookUrl(provider.key)
      })),
      connections: (data || []).map((connection) => ({
        ...redactConnection(connection),
        webhook_url: connection.webhook_url || getProviderWebhookUrl(connection.provider)
      }))
    });
  } catch (error) {
    return jsonError(error.message || 'Could not load PMS connections');
  }
}

export async function POST(request) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);
    const payload = await request.json();
    const connection = await saveConnection({
      supabase,
      hotelId: hotel.id,
      payload
    });

    return NextResponse.json({
      ok: true,
      connection
    });
  } catch (error) {
    const missingEncryptionKey = error.message?.includes('PMS_SECRET_ENCRYPTION_KEY');

    return jsonError(
      error.message || 'Could not save PMS connection',
      missingEncryptionKey ? 400 : 500,
      missingEncryptionKey ? { missing_env: ['PMS_SECRET_ENCRYPTION_KEY'] } : {}
    );
  }
}

export async function DELETE(request) {
  try {
    const { supabase, hotel } = await getCurrentHotelForRequest(request);
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('id');

    if (!connectionId) {
      return jsonError('Connection id is required', 400);
    }

    const { error } = await supabase
      .from('hotel_pms_connections')
      .delete()
      .eq('hotel_id', hotel.id)
      .eq('id', connectionId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error.message || 'Could not delete PMS connection');
  }
}
