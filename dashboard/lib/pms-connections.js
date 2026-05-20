import { encryptSecret } from './pms-encryption';
import { PMS_PROVIDER_CATALOG, getPmsProvider, isPmsProviderConfigurable } from './pms-providers';

export const PMS_PROVIDERS = PMS_PROVIDER_CATALOG;

export const redactConnection = (connection) => {
  if (!connection) {
    return null;
  }

  return {
    ...connection,
    encrypted_client_secret: undefined,
    has_client_secret: Boolean(connection.encrypted_client_secret)
  };
};

export const getBackendUrl = () => (
  process.env.PUBLIC_BACKEND_URL
  || process.env.NEXT_PUBLIC_PUBLIC_BACKEND_URL
  || process.env.NEXT_PUBLIC_BACKEND_URL
  || process.env.BACKEND_URL
  || 'http://localhost:3000'
).replace(/\/$/, '');

export const getProviderWebhookUrl = (provider = 'apaleo') => `${getBackendUrl()}/integrations/${provider}/webhook`;

const fetchWithTimeout = async (url, options = {}, timeoutMs = 22000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const saveConnection = async ({ supabase, hotelId, payload }) => {
  const provider = payload.provider || 'apaleo';
  const providerDefinition = getPmsProvider(provider);

  if (!providerDefinition) {
    throw new Error(`Unsupported PMS provider: ${provider}`);
  }

  if (!isPmsProviderConfigurable(providerDefinition)) {
    throw new Error(`${providerDefinition.name} is not ready for credential setup yet. Use the connector readiness panel to request beta activation.`);
  }

  const existingResult = await supabase
    .from('hotel_pms_connections')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('provider', provider)
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existing = existingResult.data;
  const record = {
    hotel_id: hotelId,
    provider,
    client_id: payload.client_id || null,
    account_code: payload.account_code || null,
    base_url: payload.base_url || providerDefinition.defaultBaseUrl || null,
    enabled: payload.enabled !== false,
    sync_status: existing?.sync_status || 'configured',
    webhook_url: payload.webhook_url || existing?.webhook_url || getProviderWebhookUrl(provider),
    webhook_enabled: Boolean(payload.webhook_enabled || existing?.webhook_enabled),
    webhook_status: existing?.webhook_status || 'not_configured',
    metadata: {
      ...(existing?.metadata || {}),
      ...(payload.metadata || {})
    },
    updated_at: new Date().toISOString()
  };

  if (payload.client_secret) {
    record.encrypted_client_secret = encryptSecret(payload.client_secret);
  } else if (existing?.encrypted_client_secret) {
    record.encrypted_client_secret = existing.encrypted_client_secret;
  }

  const { data, error } = await supabase
    .from('hotel_pms_connections')
    .upsert(record, {
      onConflict: 'hotel_id,provider'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return redactConnection(data);
};

export const proxyBackendPmsAction = async ({
  action,
  hotelId,
  provider = 'apaleo',
  from,
  to,
  pageSize = 50,
  maxReservations = 1000
}) => {
  const response = await fetchWithTimeout(`${getBackendUrl()}/integrations/pms-connections/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      hotelId,
      provider,
      from,
      to,
      pageSize,
      maxReservations
    })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || `${action} failed`);
  }

  return body;
};
