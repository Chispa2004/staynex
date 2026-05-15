import { getSupabase } from './supabase.service.js';
import { getDefaultHotel } from './hotel.service.js';
import { encryptSecret, decryptSecret } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import { getApaleoAccessToken } from '../integrations/apaleo/apaleo-auth.service.js';
import { apaleoFetch } from '../integrations/apaleo/apaleo-client.service.js';
import { syncReservationsFromApaleo } from '../integrations/apaleo/apaleo-sync.service.js';

const SUPPORTED_PROVIDERS = {
  apaleo: {
    key: 'apaleo',
    name: 'Apaleo',
    status: 'available',
    authType: 'oauth_client_credentials',
    defaultBaseUrl: 'https://api.apaleo.com'
  },
  mews: {
    key: 'mews',
    name: 'Mews',
    status: 'coming_soon'
  },
  cloudbeds: {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    status: 'coming_soon'
  },
  opera: {
    key: 'opera',
    name: 'Oracle OPERA',
    status: 'coming_soon'
  },
  hostaway: {
    key: 'hostaway',
    name: 'Hostaway',
    status: 'coming_soon'
  },
  sihot: {
    key: 'sihot',
    name: 'SIHOT',
    status: 'coming_soon'
  }
};

const redactConnection = (connection) => {
  if (!connection) {
    return null;
  }

  return {
    ...connection,
    encrypted_client_secret: undefined,
    has_client_secret: Boolean(connection.encrypted_client_secret)
  };
};

const resolveHotelId = async (hotelId) => {
  if (hotelId) {
    return hotelId;
  }

  const hotel = await getDefaultHotel();
  return hotel?.id || null;
};

export const getAvailablePmsProviders = () => Object.values(SUPPORTED_PROVIDERS);

export const getHotelPmsConnection = async ({ hotelId, provider = 'apaleo' } = {}) => {
  const resolvedHotelId = await resolveHotelId(hotelId);
  const client = getSupabase();
  const { data, error } = await client
    .from('hotel_pms_connections')
    .select('*')
    .eq('hotel_id', resolvedHotelId)
    .eq('provider', provider)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const getHotelPmsConnections = async ({ hotelId } = {}) => {
  const resolvedHotelId = await resolveHotelId(hotelId);
  const client = getSupabase();
  const { data, error } = await client
    .from('hotel_pms_connections')
    .select('*')
    .eq('hotel_id', resolvedHotelId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(redactConnection);
};

const buildConnectionRecord = ({
  hotelId,
  provider,
  clientId,
  clientSecret,
  accountCode,
  baseUrl,
  enabled = true,
  metadata = {}
}) => ({
  hotel_id: hotelId,
  provider,
  client_id: clientId || null,
  ...(clientSecret ? { encrypted_client_secret: encryptSecret(clientSecret) } : {}),
  account_code: accountCode || null,
  base_url: baseUrl || SUPPORTED_PROVIDERS[provider]?.defaultBaseUrl || null,
  enabled: Boolean(enabled),
  metadata,
  sync_status: 'configured',
  webhook_url: `${process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3000'}/integrations/${provider}/webhook`,
  webhook_status: 'not_configured',
  updated_at: new Date().toISOString()
});

export const saveHotelPmsConnection = async ({
  hotelId,
  provider = 'apaleo',
  clientId,
  clientSecret,
  accountCode,
  baseUrl,
  enabled = true,
  metadata = {}
} = {}) => {
  const resolvedHotelId = await resolveHotelId(hotelId);

  if (!SUPPORTED_PROVIDERS[provider]) {
    throw new Error(`Unsupported PMS provider: ${provider}`);
  }

  const client = getSupabase();
  const record = buildConnectionRecord({
    hotelId: resolvedHotelId,
    provider,
    clientId,
    clientSecret,
    accountCode,
    baseUrl,
    enabled,
    metadata
  });
  const { data, error } = await client
    .from('hotel_pms_connections')
    .upsert(record, {
      onConflict: 'hotel_id,provider'
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  logger.info('PMS connection saved', {
    hotelId: resolvedHotelId,
    provider
  });

  return redactConnection(data);
};

export const updateHotelPmsConnection = async ({ connectionId, hotelId, updates = {} } = {}) => {
  const client = getSupabase();
  const updateRecord = {
    updated_at: new Date().toISOString()
  };

  [
    'client_id',
    'account_code',
    'base_url',
    'enabled',
    'sync_status',
    'webhook_url',
    'webhook_secret',
    'webhook_enabled',
    'webhook_status',
    'last_webhook_at',
    'last_webhook_error',
    'metadata'
  ].forEach((key) => {
    if (updates[key] !== undefined) {
      updateRecord[key] = updates[key];
    }
  });

  if (updates.clientSecret) {
    updateRecord.encrypted_client_secret = encryptSecret(updates.clientSecret);
  }

  let query = client
    .from('hotel_pms_connections')
    .update(updateRecord)
    .eq('id', connectionId);

  if (hotelId) {
    query = query.eq('hotel_id', hotelId);
  }

  const { data, error } = await query.select('*').single();

  if (error) {
    throw error;
  }

  return redactConnection(data);
};

export const deleteHotelPmsConnection = async ({ connectionId, hotelId } = {}) => {
  const client = getSupabase();
  let query = client
    .from('hotel_pms_connections')
    .delete()
    .eq('id', connectionId);

  if (hotelId) {
    query = query.eq('hotel_id', hotelId);
  }

  const { error } = await query;

  if (error) {
    throw error;
  }

  return { ok: true };
};

export const connectionToApaleoConfig = (connection) => {
  if (!connection) {
    return null;
  }

  return {
    clientId: connection.client_id,
    clientSecret: decryptSecret(connection.encrypted_client_secret),
    accountCode: connection.account_code,
    baseUrl: connection.base_url || SUPPORTED_PROVIDERS.apaleo.defaultBaseUrl,
    scope: connection.metadata?.scope || ''
  };
};

export const testPmsConnection = async ({ hotelId, provider = 'apaleo' } = {}) => {
  const connection = await getHotelPmsConnection({ hotelId, provider });

  if (!connection) {
    throw new Error(`No ${provider} PMS connection found for this hotel`);
  }

  if (provider !== 'apaleo') {
    throw new Error(`${provider} is not implemented yet`);
  }

  const config = connectionToApaleoConfig(connection);
  await getApaleoAccessToken({ config, forceRefresh: true });
  await apaleoFetch('/booking/v1/reservations', {
    config,
    query: {
      pageNumber: 1,
      pageSize: 1
    }
  });

  const client = getSupabase();
  await client
    .from('hotel_pms_connections')
    .update({
      sync_status: 'connected',
      last_sync_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', connection.id);

  return {
    ok: true,
    provider,
    connection: redactConnection({
      ...connection,
      sync_status: 'connected',
      last_sync_error: null
    })
  };
};

export const syncHotelReservations = async ({
  hotelId,
  provider = 'apaleo',
  from,
  to,
  status,
  pageSize = 25,
  maxReservations = 50
} = {}) => {
  const connection = await getHotelPmsConnection({ hotelId, provider });

  if (!connection) {
    throw new Error(`No ${provider} PMS connection found for this hotel`);
  }

  if (!connection.enabled) {
    throw new Error(`${provider} PMS connection is disabled`);
  }

  if (provider !== 'apaleo') {
    throw new Error(`${provider} sync is not implemented yet`);
  }

  const client = getSupabase();

  try {
    const summary = await syncReservationsFromApaleo({
      hotelId: connection.hotel_id,
      from,
      to,
      status,
      connection,
      pageSize,
      maxReservations
    });

    await client
      .from('hotel_pms_connections')
      .update({
        sync_status: summary.errors.length > 0 ? 'partial_success' : 'success',
        last_sync_at: new Date().toISOString(),
        last_sync_error: summary.errors[0]?.error || null,
        metadata: {
          ...(connection.metadata || {}),
          last_sync_summary: summary
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    return summary;
  } catch (error) {
    await client
      .from('hotel_pms_connections')
      .update({
        sync_status: 'failed',
        last_sync_error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    throw error;
  }
};

export const getWebhookPreparation = ({ connectionId, provider }) => ({
  provider,
  webhookUrl: `${process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3000'}/integrations/${provider}/webhook`,
  status: 'manual_setup',
  connectionId,
  note: 'Copy this URL into Apaleo webhook configuration for reservation events: created, amended, canceled, deleted.'
});
