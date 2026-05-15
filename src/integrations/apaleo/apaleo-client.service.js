import { getApaleoAccessToken, getApaleoConfig } from './apaleo-auth.service.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 15000;

const buildUrl = ({ baseUrl, path, query = {} }) => {
  const url = new URL(path.startsWith('http') ? path : `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(','));
      return;
    }

    url.searchParams.set(key, String(value));
  });

  return url;
};

const parseResponse = async (response) => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const apaleoFetch = async (path, {
  method = 'GET',
  query,
  body,
  config: overrideConfig = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
  const config = getApaleoConfig(overrideConfig);
  const token = await getApaleoAccessToken({ config });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = buildUrl({
    baseUrl: config.baseUrl,
    path,
    query
  });

  logger.info('Apaleo API request', {
    method,
    path: url.pathname,
    accountCode: config.accountCode
  });

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      const message = typeof payload === 'string'
        ? payload
        : payload?.message || payload?.error_description || payload?.error || 'Apaleo API request failed';

      logger.warn('Apaleo API request failed', {
        method,
        path: url.pathname,
        status: response.status,
        trackingId: response.headers.get('apaleo-tracking-id') || null
      });

      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
};
