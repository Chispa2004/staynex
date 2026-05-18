import { NextResponse } from 'next/server';
import {
  getPlatformContext,
  writePlatformAuditLog
} from '@/lib/platform';
import { sendProviderEmail } from '../../../../../src/services/provider-lead-email.service.js';

export const dynamic = 'force-dynamic';

const jsonOptions = {
  headers: { 'Cache-Control': 'no-store' }
};

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

    const emailResult = await sendProviderEmail({
      to,
      subject,
      message,
      context: 'platform_test'
    });
    const result = {
      success: emailResult.status === 'sent',
      provider: 'smtp',
      status: emailResult.status,
      reason: emailResult.reason,
      messageId: emailResult.transport?.messageId || null,
      accepted: emailResult.transport?.accepted || [],
      error: emailResult.error || null,
      smtp: emailResult.smtp || emailResult.error?.smtpConfig || null
    };

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
      status: result.success ? 200 : 502,
      ...jsonOptions
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      provider: 'smtp',
      error: error.message || 'Could not send provider test email'
    }, { status: error.status || 500, ...jsonOptions });
  }
}
