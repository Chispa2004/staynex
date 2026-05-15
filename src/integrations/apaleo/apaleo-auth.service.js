import { logger } from '../../utils/logger.js';

const TOKEN_ENDPOINT = 'https://identity.apaleo.com/connect/token';
const TOKEN_EXPIRY_SAFETY_MS = 60 * 1000;
const TOKEN_TIMEOUT_MS = 15000;

let cachedToken = null;

export class ApaleoConfigurationError extends Error {
  constructor(message, missingEnv = []) {
    super(message);
    this.name = 'ApaleoConfigurationError';
    this.missingEnv = missingEnv;
  }
}

const requiredEnv = [
  'APALEO_CLIENT_ID',
  'APALEO_CLIENT_SECRET',
  'APALEO_ACCOUNT_CODE'
];

export const getApaleoConfig = (overrideConfig = null) => {
  if (overrideConfig) {
    const missingConfig = [
      ['clientId', 'APALEO_CLIENT_ID'],
      ['clientSecret', 'APALEO_CLIENT_SECRET'],
      ['accountCode', 'APALEO_ACCOUNT_CODE']
    ].filter(([key]) => !overrideConfig[key]).map(([, envName]) => envName);

    if (missingConfig.length > 0) {
      throw new ApaleoConfigurationError(
        `Missing Apaleo connection values: ${missingConfig.join(', ')}`,
        missingConfig
      );
    }

    return {
      clientId: overrideConfig.clientId,
      clientSecret: overrideConfig.clientSecret,
      accountCode: overrideConfig.accountCode,
      baseUrl: overrideConfig.baseUrl || 'https://api.apaleo.com',
      scope: overrideConfig.scope || ''
    };
  }

  const missingEnv = requiredEnv.filter((name) => !process.env[name]);

  if (missingEnv.length > 0) {
    throw new ApaleoConfigurationError(
      `Missing Apaleo environment variables: ${missingEnv.join(', ')}`,
      missingEnv
    );
  }

  return {
    clientId: process.env.APALEO_CLIENT_ID,
    clientSecret: process.env.APALEO_CLIENT_SECRET,
    accountCode: process.env.APALEO_ACCOUNT_CODE,
    baseUrl: process.env.APALEO_BASE_URL || 'https://api.apaleo.com',
    scope: process.env.APALEO_SCOPE || ''
  };
};

const getCacheKey = (config) => `${config.accountCode}:${config.clientId}`;

export const getApaleoAccessToken = async ({ forceRefresh = false, config: overrideConfig = null } = {}) => {
  const now = Date.now();
  const config = getApaleoConfig(overrideConfig);
  const cacheKey = getCacheKey(config);

  if (
    !forceRefresh
    && cachedToken?.[cacheKey]?.accessToken
    && cachedToken[cacheKey].expiresAt > now + TOKEN_EXPIRY_SAFETY_MS
  ) {
    return cachedToken[cacheKey].accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials'
  });

  if (config.scope) {
    body.set('scope', config.scope);
  }

  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  logger.info('Requesting Apaleo access token', {
    clientId: config.clientId,
    accountCode: config.accountCode,
    scope: config.scope || 'configured-on-client'
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.APALEO_TIMEOUT_MS || TOKEN_TIMEOUT_MS));
  let response;
  let text;

  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body,
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Apaleo authentication timed out after ${process.env.APALEO_TIMEOUT_MS || TOKEN_TIMEOUT_MS}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {
      error: text || 'Invalid token response'
    };
  }

  if (!response.ok || !payload.access_token) {
    logger.warn('Apaleo token request failed', {
      status: response.status,
      error: payload.error,
      errorDescription: payload.error_description
    });

    throw new Error(payload.error_description || payload.error || 'Apaleo authentication failed');
  }

  cachedToken = {
    ...(cachedToken || {}),
    [cacheKey]: {
      accessToken: payload.access_token,
      expiresAt: now + Number(payload.expires_in || 3600) * 1000
    }
  };

  logger.info('Apaleo access token ready', {
    expiresInSeconds: payload.expires_in || 3600
  });

  return cachedToken[cacheKey].accessToken;
};

export const clearApaleoTokenCache = () => {
  cachedToken = null;
};
