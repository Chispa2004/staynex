import { encryptSecret } from './pms-encryption';
import { getInternalApiHeaders } from './internal-api';
import { PMS_PROVIDER_CATALOG, getPmsProvider, isPmsProviderConfigurable, isPmsProviderLiveApi } from './pms-providers';
import {
  pmsConnectionInternalSelectForSurface,
  sanitizePmsConnectionMetadata,
  serializePmsConnectionSafe
} from '../../shared/pms/safe-connection.js';

export const PMS_PROVIDERS = PMS_PROVIDER_CATALOG;
export const PMS_CONNECTION_SELECT = pmsConnectionInternalSelectForSurface('tenant_settings');

export const safePmsConnectionDto = (connection, options = {}) => serializePmsConnectionSafe(connection, {
  surface: 'tenant_settings',
  ...options
});

export const getBackendUrl = () => (
  process.env.PUBLIC_BACKEND_URL
  || process.env.NEXT_PUBLIC_PUBLIC_BACKEND_URL
  || process.env.NEXT_PUBLIC_BACKEND_URL
  || process.env.BACKEND_URL
  || 'http://localhost:3000'
).replace(/\/$/, '');

export const getProviderWebhookUrl = (provider = 'apaleo') => `${getBackendUrl()}/integrations/${provider}/webhook`;

export const assertPmsHotelContext = ({ hotel, fallback } = {}) => {
  if (!hotel?.id || fallback) {
    const error = new Error('Explicit hotel workspace is required for PMS operations');
    error.status = 400;
    throw error;
  }

  return hotel.id;
};

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
    throw new Error(`${providerDefinition.name} is not ready for setup yet.`);
  }

  const existingResult = await supabase
    .from('hotel_pms_connections')
    .select(PMS_CONNECTION_SELECT)
    .eq('hotel_id', hotelId)
    .eq('provider', provider)
    .limit(1)
    .maybeSingle();

  if (existingResult.error) {
    throw existingResult.error;
  }

  const existing = existingResult.data;
  const connectionMode = payload.connection_mode || payload.connectionMode || providerDefinition.configurationMode || 'manual_setup';
  const pendingSetup = !isPmsProviderLiveApi(providerDefinition);
  const existingEncryptedCredentials = existing?.metadata?.credentials_encrypted;
  const metadata = {
    ...sanitizePmsConnectionMetadata(existing?.metadata || {}),
    ...sanitizePmsConnectionMetadata(payload.metadata || {}),
    connection_mode: connectionMode,
    property_id: payload.property_id || payload.propertyId || payload.account_code || payload.accountCode || existing?.metadata?.property_id || null,
    notes: payload.notes || existing?.metadata?.notes || null,
    setup_status: pendingSetup ? 'pending_setup' : 'live_api',
    activation_requested_at: payload.activation_requested ? new Date().toISOString() : existing?.metadata?.activation_requested_at || null
  };

  if (payload.api_key || payload.apiKey) {
    metadata.credentials_encrypted = {
      ...(existingEncryptedCredentials || {}),
      api_key: encryptSecret(payload.api_key || payload.apiKey)
    };
  } else if (existingEncryptedCredentials) {
    metadata.credentials_encrypted = existingEncryptedCredentials;
  }

  const record = {
    hotel_id: hotelId,
    provider,
    client_id: payload.client_id || payload.clientId || null,
    account_code: payload.account_code || payload.accountCode || payload.property_id || payload.propertyId || null,
    base_url: payload.base_url || providerDefinition.defaultBaseUrl || null,
    enabled: payload.enabled !== false,
    sync_status: pendingSetup ? 'pending_setup' : existing?.sync_status || 'configured',
    webhook_url: payload.webhook_url || existing?.webhook_url || getProviderWebhookUrl(provider),
    webhook_enabled: Boolean(payload.webhook_enabled || existing?.webhook_enabled),
    webhook_status: existing?.webhook_status || 'not_configured',
    metadata,
    updated_at: new Date().toISOString()
  };

  const clientSecret = payload.client_secret || payload.clientSecret;

  if (clientSecret) {
    record.encrypted_client_secret = encryptSecret(clientSecret);
  } else if (existing?.encrypted_client_secret) {
    record.encrypted_client_secret = existing.encrypted_client_secret;
  }

  const webhookSecret = payload.webhook_secret || payload.webhookSecret;
  if (webhookSecret) {
    record.encrypted_webhook_secret = encryptSecret(webhookSecret);
  } else if (existing?.encrypted_webhook_secret) {
    record.encrypted_webhook_secret = existing.encrypted_webhook_secret;
  }

  const { data, error } = await supabase
    .from('hotel_pms_connections')
    .upsert(record, {
      onConflict: 'hotel_id,provider'
    })
    .select(PMS_CONNECTION_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return safePmsConnectionDto(data);
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
    headers: getInternalApiHeaders({
      'Content-Type': 'application/json'
    }),
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
    const error = new Error(body.error || `${action} failed`);
    error.status = response.status;
    throw error;
  }

  return body;
};
