import { getSupabase } from './supabase.service.js';
import { encryptSecret, decryptSecret } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import {
  pmsConnectionInternalSelectForSurface,
  sanitizePmsConnectionMetadata,
  serializePmsConnectionSafe
} from '../../shared/pms/safe-connection.js';
import { getApaleoAccessToken } from '../integrations/apaleo/apaleo-auth.service.js';
import { apaleoFetch } from '../integrations/apaleo/apaleo-client.service.js';
import { syncReservationsFromApaleo } from '../integrations/apaleo/apaleo-sync.service.js';
import { sanitizeWebhookErrorCode } from './pms-webhook-quarantine.service.js';
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

const serializeTenantConnection = (connection) => serializePmsConnectionSafe(connection, { surface: 'tenant_settings' });
const PMS_TENANT_SELECT = pmsConnectionInternalSelectForSurface('tenant_settings');

class PmsConnectionSyncError extends Error {
  constructor(error) {
    const safeCode = sanitizeWebhookErrorCode(error);
    super(safeCode);
    this.name = 'PmsConnectionSyncError';
    this.safeErrorCode = safeCode;
    this.statusCode = error?.statusCode || error?.status || 500;
  }
}

export const resolvePmsWebhookSecret = (connection) => {
  if (!connection) {
    return null;
  }

  if (connection.encrypted_webhook_secret) {
    return decryptSecret(connection.encrypted_webhook_secret);
  }

  return null;
};

export class PmsHotelContextRequiredError extends Error {
  constructor() {
    super('hotelId is required for PMS operations');
    this.name = 'PmsHotelContextRequiredError';
    this.statusCode = 400;
  }
}

const requirePmsHotelId = (hotelId) => {
  if (hotelId) {
    return hotelId;
  }

  throw new PmsHotelContextRequiredError();
};

export const getAvailablePmsProviders = () => listPmsConnectors();

export const getHotelPmsConnection = async ({ hotelId, provider = 'apaleo' } = {}) => {
  const resolvedHotelId = requirePmsHotelId(hotelId);
  const client = getSupabase();
  const { data, error } = await client
    .from('hotel_pms_connections')
    .select(PMS_TENANT_SELECT)
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
  const resolvedHotelId = requirePmsHotelId(hotelId);
  const client = getSupabase();
  const { data, error } = await client
    .from('hotel_pms_connections')
    .select(PMS_TENANT_SELECT)
    .eq('hotel_id', resolvedHotelId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(serializeTenantConnection);
};

const buildConnectionRecord = ({
  hotelId,
  provider,
  clientId,
  clientSecret,
  accountCode,
  apiKey,
  webhookSecret,
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
  const cleanMetadata = sanitizePmsConnectionMetadata(metadata);
  const safeMetadata = {
    ...cleanMetadata,
    connection_mode: connectionMode || definition?.configurationMode || 'manual_setup',
    property_id: propertyId || accountCode || cleanMetadata.property_id || null,
    notes: notes || cleanMetadata.notes || null,
    setup_status: pendingSetup ? 'pending_setup' : 'live_api',
    activation_requested_at: activationRequested ? new Date().toISOString() : cleanMetadata.activation_requested_at || null
  };

  if (apiKey) {
    safeMetadata.credentials_encrypted = {
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
    ...(webhookSecret ? { encrypted_webhook_secret: encryptSecret(webhookSecret) } : {}),
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
  webhookSecret,
  propertyId,
  baseUrl,
  enabled = true,
  connectionMode,
  notes,
  activationRequested = false,
  metadata = {},
  supabase = getSupabase()
} = {}) => {
  const resolvedHotelId = requirePmsHotelId(hotelId);

  if (!getPmsConnectorDefinition(provider)) {
    throw new Error(`Unsupported PMS provider: ${provider}`);
  }

  if (!isPmsConnectorConfigurable(provider)) {
    throw new Error(`${getPmsConnectorDefinition(provider).name} is registered in Staynex but setup is not enabled yet`);
  }

  const client = supabase;
  const record = buildConnectionRecord({
    hotelId: resolvedHotelId,
    provider,
    clientId,
    clientSecret,
    accountCode,
    apiKey: apiKey || metadata.api_key || metadata.apiKey,
    webhookSecret: webhookSecret || metadata.webhook_secret || metadata.webhookSecret,
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
    .select(PMS_TENANT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  logger.info('PMS connection saved', {
    hotelId: resolvedHotelId,
    provider
  });

  return serializeTenantConnection(data);
};

export const updateHotelPmsConnection = async ({
  connectionId,
  hotelId,
  updates = {},
  supabase = getSupabase()
} = {}) => {
  const resolvedHotelId = requirePmsHotelId(hotelId);
  const client = supabase;
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

  const webhookSecret = updates.webhookSecret || updates.webhook_secret;
  if (webhookSecret) {
    updateRecord.encrypted_webhook_secret = encryptSecret(webhookSecret);
  }

  let query = client
    .from('hotel_pms_connections')
    .update(updateRecord)
    .eq('id', connectionId);

  query = query.eq('hotel_id', resolvedHotelId);

  const { data, error } = await query.select(PMS_TENANT_SELECT).single();

  if (error) {
    throw error;
  }

  return serializeTenantConnection(data);
};

export const deleteHotelPmsConnection = async ({ connectionId, hotelId } = {}) => {
  const resolvedHotelId = requirePmsHotelId(hotelId);
  const client = getSupabase();
  const { data: existing, error: existingError } = await client
    .from('hotel_pms_connections')
    .select(PMS_TENANT_SELECT)
    .eq('id', connectionId)
    .eq('hotel_id', resolvedHotelId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const { data, error } = await client
    .from('hotel_pms_connections')
    .update({
      enabled: false,
      webhook_enabled: false,
      webhook_status: 'not_configured',
      last_webhook_error: null,
      sync_status: 'pending_setup',
      metadata: {
        ...(existing?.metadata || {}),
        disabled_reason: 'user_deleted_connection',
        disabled_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', connectionId)
    .eq('hotel_id', resolvedHotelId)
    .select(PMS_TENANT_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return {
    ok: true,
    connection: serializeTenantConnection(data)
  };
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
      connection: serializeTenantConnection({
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
    connection: serializeTenantConnection({
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
      .eq('id', connection.id)
      .eq('hotel_id', connection.hotel_id);

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
      .eq('id', connection.id)
      .eq('hotel_id', connection.hotel_id);

    return summary;
  } catch (error) {
    const safeError = sanitizeWebhookErrorCode(error);
    await client
      .from('hotel_pms_connections')
      .update({
        sync_status: 'failed',
        last_sync_error: safeError,
        updated_at: new Date().toISOString()
      })
      .eq('id', connection.id)
      .eq('hotel_id', connection.hotel_id);

    throw new PmsConnectionSyncError(error);
  }
};

export const getWebhookPreparation = ({ connectionId, provider }) => ({
  provider,
  webhookUrl: `${process.env.PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3000'}/integrations/${provider}/webhook`,
  status: 'manual_setup',
  connectionId,
  note: 'Copy this URL into Apaleo webhook configuration for reservation events: created, amended, canceled, deleted.'
});
