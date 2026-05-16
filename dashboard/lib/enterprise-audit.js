const isMissingEnterpriseAuditTable = (error) => (
  error?.message?.includes('enterprise_audit_logs')
  || error?.details?.includes('enterprise_audit_logs')
  || error?.hint?.includes('enterprise_audit_logs')
);

const summarize = (value = {}) => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    if (item === undefined) return acc;
    if (item === null || ['string', 'number', 'boolean'].includes(typeof item)) {
      acc[key] = item;
    }
    return acc;
  }, {});
};

export const writeEnterpriseAuditLog = async ({
  supabase,
  request = null,
  actor = null,
  actorRole = null,
  actorPlatformRole = 'none',
  hotelId = null,
  action,
  entityType,
  entityId = null,
  oldValues = {},
  newValues = {},
  metadata = {}
}) => {
  if (!supabase || !action || !entityType) {
    return;
  }

  const userAgent = request?.headers?.get?.('user-agent') || null;
  const forwardedFor = request?.headers?.get?.('x-forwarded-for') || null;

  try {
    await supabase.from('enterprise_audit_logs').insert({
      actor_user_id: actor?.id || null,
      actor_email: actor?.email || null,
      actor_role: actorRole || null,
      actor_platform_role: actorPlatformRole || 'none',
      hotel_id: hotelId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values_summary: summarize(oldValues),
      new_values_summary: summarize(newValues),
      user_agent: userAgent,
      metadata: {
        ...metadata,
        forwarded_for: forwardedFor
      }
    });
  } catch (error) {
    if (!isMissingEnterpriseAuditTable(error)) {
      console.warn('Enterprise audit log write failed', error.message);
    }
  }
};
