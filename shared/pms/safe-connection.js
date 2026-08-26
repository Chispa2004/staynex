const SECRET_FIELD_NAMES = new Set([
  'encrypted_client_secret',
  'webhook_secret',
  'encrypted_webhook_secret',
  'credentials_encrypted',
  'client_secret',
  'clientsecret',
  'api_key',
  'apikey',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'authorization',
  'password',
  'secret',
  'token'
]);

const SECRET_KEY_PATTERN = /(secret|token|password|authorization|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|credentials?[_-]?encrypted)/i;

const SURFACE_FIELDS = {
  tenant_settings: [
    'id',
    'hotel_id',
    'provider',
    'client_id',
    'account_code',
    'property_id',
    'base_url',
    'enabled',
    'status',
    'connection_mode',
    'sync_status',
    'last_sync_at',
    'last_sync_error',
    'last_test_at',
    'webhook_url',
    'webhook_enabled',
    'webhook_status',
    'last_webhook_at',
    'last_webhook_error',
    'metadata',
    'notes',
    'created_at',
    'updated_at'
  ],
  platform_summary: [
    'id',
    'hotel_id',
    'provider',
    'enabled',
    'status',
    'connection_mode',
    'property_id',
    'sync_status',
    'last_sync_at',
    'last_sync_error',
    'last_test_at',
    'webhook_enabled',
    'webhook_status',
    'last_webhook_at',
    'last_webhook_error',
    'created_at',
    'updated_at'
  ],
  health: [
    'id',
    'hotel_id',
    'provider',
    'enabled',
    'status',
    'sync_status',
    'last_sync_at',
    'last_sync_error',
    'last_test_at',
    'webhook_enabled',
    'webhook_status',
    'last_webhook_at',
    'last_webhook_error',
    'metadata',
    'created_at',
    'updated_at'
  ],
  audit: [
    'id',
    'hotel_id',
    'provider',
    'enabled',
    'status',
    'connection_mode',
    'property_id',
    'sync_status',
    'last_sync_at',
    'last_sync_error',
    'last_test_at',
    'webhook_enabled',
    'webhook_status',
    'last_webhook_at',
    'last_webhook_error',
    'created_at',
    'updated_at'
  ]
};

const STRICT_SURFACE = 'audit';

export const isPmsSecretKey = (key = '') => {
  const normalized = String(key || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return SECRET_FIELD_NAMES.has(normalized) || SECRET_KEY_PATTERN.test(normalized);
};

const hasValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

export const sanitizePmsNestedValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePmsNestedValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value).reduce((safe, [key, item]) => {
    if (isPmsSecretKey(key)) {
      return safe;
    }

    safe[key] = sanitizePmsNestedValue(item);
    return safe;
  }, {});
};

const sanitizeOperationalMessage = (value) => {
  if (!value) {
    return null;
  }

  const text = String(value);

  if (SECRET_KEY_PATTERN.test(text) || /bearer\s+|basic\s+/i.test(text)) {
    return 'redacted_sensitive_error';
  }

  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
};

export const sanitizePmsConnectionMetadata = (metadata = {}) => sanitizePmsNestedValue(metadata || {});

export const getPmsConnectionSecretFlags = (connection = {}) => {
  const metadataCredentials = connection.metadata?.credentials_encrypted;
  const topLevelCredentials = connection.credentials_encrypted;
  const hasClientSecret = hasValue(connection.encrypted_client_secret) || connection.has_client_secret === true;
  const hasApiKey = hasValue(metadataCredentials?.api_key || metadataCredentials?.apiKey || topLevelCredentials?.api_key || topLevelCredentials?.apiKey)
    || connection.api_key_configured === true;
  const credentialConfigured = hasClientSecret || hasApiKey || hasValue(metadataCredentials) || hasValue(topLevelCredentials)
    || connection.credential_configured === true;
  const webhookSecretConfigured = hasValue(connection.encrypted_webhook_secret) || hasValue(connection.webhook_secret)
    || connection.webhook_secret_configured === true;

  return {
    credential_configured: credentialConfigured,
    has_client_secret: hasClientSecret,
    api_key_configured: hasApiKey,
    webhook_secret_configured: webhookSecretConfigured
  };
};

const pickSurfaceFields = (connection, surface) => {
  const fields = SURFACE_FIELDS[surface] || SURFACE_FIELDS[STRICT_SURFACE];
  return fields.reduce((safe, field) => {
    if (Object.prototype.hasOwnProperty.call(connection, field)) {
      safe[field] = connection[field];
    }

    return safe;
  }, {});
};

export const serializePmsConnectionSafe = (connection, { surface = STRICT_SURFACE } = {}) => {
  if (!connection) {
    return null;
  }

  const flags = getPmsConnectionSecretFlags(connection);
  const safe = sanitizePmsNestedValue(pickSurfaceFields(connection, surface));

  if (safe.last_sync_error) {
    safe.last_sync_error = sanitizeOperationalMessage(safe.last_sync_error);
  }

  if (safe.last_webhook_error) {
    safe.last_webhook_error = sanitizeOperationalMessage(safe.last_webhook_error);
  }

  return {
    ...safe,
    ...flags
  };
};

export const serializePmsConnectionsSafe = (connections = [], options = {}) => (
  (connections || []).map((connection) => serializePmsConnectionSafe(connection, options)).filter(Boolean)
);

export const pmsConnectionSelectForSurface = (surface = STRICT_SURFACE) => {
  const surfaceFields = SURFACE_FIELDS[surface] || SURFACE_FIELDS[STRICT_SURFACE];
  const fields = new Set([
    ...surfaceFields,
    'encrypted_client_secret',
    'webhook_secret',
    'encrypted_webhook_secret',
    'credentials_encrypted'
  ]);

  return [...fields].join(', ');
};
