import { NextResponse } from 'next/server';
import {
  getPlatformContext,
  writePlatformAuditLog
} from '@/lib/platform';

export const dynamic = 'force-dynamic';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

const getBackendUrl = () => (
  process.env.BACKEND_URL
  || process.env.NEXT_PUBLIC_BACKEND_URL
  || 'http://localhost:3000'
);

const normalize = (value) => String(value || '').trim();

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request) {
  try {
    const { supabase, user, platformRole } = await getPlatformContext(request, { requireAdmin: true });
    const body = await request.json().catch(() => ({}));
    const to = normalize(body.to);
    const subject = normalize(body.subject) || 'Staynex provider email test';
    const message = normalize(body.message) || 'This is a Staynex provider email delivery test.';

    if (!isValidEmail(to)) {
      return NextResponse.json({
        success: false,
        error: 'A valid recipient email is required'
      }, { status: 400, ...jsonOptions });
    }

    const backendResponse = await fetch(`${getBackendUrl()}/api/platform/test-provider-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(request.headers.get('authorization')
          ? { Authorization: request.headers.get('authorization') }
          : {})
      },
      cache: 'no-store',
      body: JSON.stringify({
        to,
        subject,
        message
      })
    });
    const result = await backendResponse.json().catch(() => ({
      success: false,
      provider: 'email',
      error: 'Backend provider email test returned an invalid response'
    }));

    await writePlatformAuditLog({
      supabase,
      actor: user,
      platformRole,
      action: 'provider_email_test_sent',
      metadata: {
        to,
        success: result.success,
        status: result.status,
        provider: result.provider,
        error_code: result.error?.code || null
      }
    });

    return NextResponse.json(result, {
      status: backendResponse.status,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      provider: 'email',
      error: error.message || 'Could not send provider test email'
    }, { status: error.status || 500, ...jsonOptions });
  }
}
