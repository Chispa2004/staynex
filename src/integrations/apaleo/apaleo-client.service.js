import {assertApaleoDestination} from '../../../shared/pms/connection-contract.js';
import { getApaleoAccessToken, getApaleoConfig } from './apaleo-auth.service.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryStatus = (status) => [429, 500, 502, 503, 504].includes(status);

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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES
} = {}) => {
  const config = getApaleoConfig(overrideConfig);
  assertApaleoDestination(config.baseUrl,path,config.environment,method);
  const url = buildUrl({
    baseUrl: config.baseUrl,
    path,
    query
  });

  assertApaleoDestination(config.baseUrl,url.href,config.environment,method);
  const token = await getApaleoAccessToken({ config });
  logger.info('Apaleo API request', {
    method,
    path: url.pathname,
    accountCode: config.accountCode
  });

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        redirect:'error',
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
        const message = 'PMS_API_REQUEST_FAILED';

        logger.warn('Apaleo API request failed', {
          method,
          path: url.pathname,
          status: response.status,
          attempt: attempt + 1,
          trackingId: response.headers.get('apaleo-tracking-id') || null
        });

        const error = new Error(message);
        error.status = response.status;


        if (attempt < retries && shouldRetryStatus(response.status)) {
          await sleep(350 * (attempt + 1));
          continue;
        }

        throw error;
      }

      return payload;
    } catch (error) {
      if (error.name === 'AbortError') {
        if (attempt < retries) {
          logger.warn('Apaleo API request timed out; retrying', {
            method,
            path: url.pathname,
            attempt: attempt + 1,
            timeoutMs
          });
          await sleep(350 * (attempt + 1));
          continue;
        }

        throw new Error(`Apaleo API request timed out after ${timeoutMs}ms`);
      }

      if(error.status) throw error;
      throw new Error('PMS_TRANSPORT_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Apaleo API request failed after retries');
};
