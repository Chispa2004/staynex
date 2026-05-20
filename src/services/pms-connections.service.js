import { getSupabase } from './supabase.service.js';
import { getDefaultHotel } from './hotel.service.js';
import { encryptSecret, decryptSecret } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import { getApaleoAccessToken } from '../integrations/apaleo/apaleo-auth.service.js';
import { apaleoFetch } from '../integrations/apaleo/apaleo-client.service.js';
import { syncReservationsFromApaleo } from '../integrations/apaleo/apaleo-sync.service.js';
import {
  getPmsConnectorDefinition,
  isPmsConnectorConfigurable,
  isPmsConnectorLiveApi,
  listPmsConnectors
} from '../integrations/pms/registry.js';
import {
  getPmsBatchSize,
  getPmsMaxReservations
} from './scalability-guard.service.js';

const redactConnection = (connection) => {
  if (!connection) {
    return null;
  }

  return {
    ...connection,
    encrypted_client_secret: undefined,
    metadata: {
      ...(connection.metadata || {}),
      credentials_encrypted: undefined
    },
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

export const getAvailablePmsProviders = () => listPmsConnectors();

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
  apiKey,
  propertyId,
  baseUrl,
  enabled = true,
  connectionMode,
  notes,
  activationRequested = false,
  metadata = {}
}) => {
  const definition = getPmsConnectorDefinition(provider);
  const pendingSetup = !isPmsConnectorLiveApi(provider);
  const safeMetadata = {
    ...metadata,
    connection_mode: connectionMode || definition?.configurationMode || 'manual_setup',
    property_id: propertyId || accountCode || metadata.property_id || null,
    notes: notes || metadata.notes || null,
    setup_status: pendingSetup ? 'pending_setup' : 'live_api',
    activation_requested_at: activationRequested ? new Date().toISOString() : metadata.activation_requested_at || null
  };

  if (apiKey) {
    safeMetadata.credentials_encrypted = {
      ...(metadata.credentials_encrypted || {}),
      api_key: encryptSecret(apiKey)
    };
  }

  return {
    hotel_id: hotelId,
    provider,
    client_id: clientId || null,
    ...(clientSecret ? { encrypted_client_secret: encryptSecret(clientSecret) } : {}),
    account_code: accountCode || propertyId || null,
    base_url: baseUrl || definition?.defaultBaseUrl || null,
    enabled: Boolean(enabled),
    metadata: safeMetadata,
    sync_status: pendingSetup ? 'pending_setup' : 'configured',
    webhook_url: `${process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3000'}/integrations/${provider}/webhook`,
    webhook_status: 'not_configured',
    updated_at: new Date().toISOString()
  };
};

export const saveHotelPmsConnection = async ({
  hotelId,
  provider = 'apaleo',
  clientId,
  clientSecret,
  accountCode,
  apiKey,
  propertyId,
  baseUrl,
  enabled = true,
  connectionMode,
  notes,
  activationRequested = false,
  metadata = {}
} = {}) => {
  const resolvedHotelId = await resolveHotelId(hotelId);

  if (!getPmsConnectorDefinition(provider)) {
    throw new Error(`Unsupported PMS provider: ${provider}`);
  }

  if (!isPmsConnectorConfigurable(provider)) {
    throw new Error(`${getPmsConnectorDefinition(provider).name} is registered in Staynex but setup is not enabled yet`);
  }

  const client = getSupabase();
  const record = buildConnectionRecord({
    hotelId: resolvedHotelId,
    provider,
    clientId,
    clientSecret,
    accountCode,
    apiKey: apiKey || metadata.api_key || metadata.apiKey,
    propertyId: propertyId || metadata.property_id || metadata.propertyId,
    baseUrl,
    enabled,
    connectionMode: connectionMode || metadata.connection_mode || metadata.connectionMode,
    notes: notes || metadata.notes,
    activationRequested: activationRequested || metadata.activation_requested,
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
    baseUrl: connection.base_url || getPmsConnectorDefinition('apaleo').defaultBaseUrl,
    scope: connection.metadata?.scope || ''
  };
};

export const testPmsConnection = async ({ hotelId, provider = 'apaleo' } = {}) => {
  const connection = await getHotelPmsConnection({ hotelId, provider });

  if (!connection) {
    throw new Error(`No ${provider} PMS connection found for this hotel`);
  }

  if (provider !== 'apaleo') {
    const client = getSupabase();
    await client
      .from('hotel_pms_connections')
      .update({
        sync_status: 'pending_setup',
        last_sync_error: null,
        metadata: {
          ...(connection.metadata || {}),
          setup_status: 'pending_setup',
          last_test_at: new Date().toISOString(),
          last_test_result: 'activation_required'
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    return {
      ok: true,
      provider,
      status: 'pending_setup',
      connection: redactConnection({
        ...connection,
        sync_status: 'pending_setup',
        metadata: {
          ...(connection.metadata || {}),
          last_test_result: 'activation_required'
        }
      }),
      message: 'Configuration saved. Staynex team must activate the live connector before syncing.'
    };
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
  pageSize = getPmsBatchSize(),
  maxReservations = getPmsMaxReservations()
} = {}) => {
  const connection = await getHotelPmsConnection({ hotelId, provider });

  if (!connection) {
    throw new Error(`No ${provider} PMS connection found for this hotel`);
  }

  if (!connection.enabled) {
    throw new Error(`${provider} PMS connection is disabled`);
  }

  if (provider !== 'apaleo') {
    await getSupabase()
      .from('hotel_pms_connections')
      .update({
        sync_status: 'pending_setup',
        last_sync_error: 'Connector activation required before syncing',
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id);

    return {
      provider,
      totalFetched: 0,
      totalProcessed: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      errors: [],
      lastSyncedAt: null,
      status: 'pending_setup',
      message: 'Configuration saved. Staynex team must activate the live connector before syncing.'
    };
  }

  const client = getSupabase();

  try {
    const summary = await syncReservationsFromApaleo({
      hotelId: connection.hotel_id,
      from,
      to,
      status,
      connection,
      pageSize: Number(pageSize) || getPmsBatchSize(),
      maxReservations: Number(maxReservations) || getPmsMaxReservations()
    });

    await client
      .from('hotel_pms_connections')
      .update({
        sync_status: summary.errors.length > 0 ? 'partial_success' : 'success',
        last_sync_at: summary.lastSyncedAt || new Date().toISOString(),
        last_sync_error: summary.errors[0]?.error || null,
        metadata: {
          ...(connection.metadata || {}),
          last_sync_summary: summary,
          last_sync_progress: {
            totalFetched: summary.totalFetched,
            totalProcessed: summary.totalProcessed,
            totalInserted: summary.totalInserted,
            totalUpdated: summary.totalUpdated,
            totalSkipped: summary.totalSkipped,
            lastSyncedAt: summary.lastSyncedAt
          }
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
