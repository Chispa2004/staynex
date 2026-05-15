import { apaleoFetch } from './apaleo-client.service.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_MAX_RESERVATIONS = 50;
const MAX_PAGE_SIZE = 50;
const MAX_PAGES = 4;

const extractReservations = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.reservations)) {
    return payload.reservations;
  }

  if (Array.isArray(payload?.items)) {
    return payload.items;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};

const hasNextPage = ({ payload, page, pageSize, count, itemsLength }) => {
  if (payload?.nextPage) {
    return true;
  }

  if (Number.isFinite(Number(payload?.pageCount))) {
    return page < Number(payload.pageCount);
  }

  if (Number.isFinite(Number(count))) {
    return page * pageSize < Number(count);
  }

  return itemsLength === pageSize;
};

export const getReservations = async ({
  from,
  to,
  status,
  config = null,
  pageSize = DEFAULT_PAGE_SIZE,
  maxReservations = DEFAULT_MAX_RESERVATIONS
} = {}) => {
  const reservations = [];
  const normalizedPageSize = Math.min(Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const normalizedMaxReservations = Math.min(Math.max(Number(maxReservations) || DEFAULT_MAX_RESERVATIONS, 1), 200);
  const maxPagesForLimit = Math.ceil(normalizedMaxReservations / normalizedPageSize);
  const pageLimit = Math.min(MAX_PAGES, maxPagesForLimit);

  logger.info('Apaleo reservations fetch started', {
    from,
    to,
    status: status || 'any',
    pageSize: normalizedPageSize,
    maxReservations: normalizedMaxReservations
  });

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const payload = await apaleoFetch('/booking/v1/reservations', {
      config,
      timeoutMs: Number(process.env.APALEO_TIMEOUT_MS || 15000),
      query: {
        pageNumber,
        pageSize: normalizedPageSize,
        arrival: [from, to].filter(Boolean).join(','),
        ...(status ? { status } : {}),
        expand: 'booker'
      }
    });
    const pageReservations = extractReservations(payload);

    reservations.push(...pageReservations);

    const count = payload?.count ?? payload?.totalCount;

    logger.info('Apaleo reservations page fetched', {
      pageNumber,
      count: pageReservations.length,
      totalCount: count ?? null
    });

    if (reservations.length >= normalizedMaxReservations) {
      break;
    }

    if (!hasNextPage({
      payload,
      page: pageNumber,
      pageSize: normalizedPageSize,
      count,
      itemsLength: pageReservations.length
    })) {
      break;
    }
  }

  const limitedReservations = reservations.slice(0, normalizedMaxReservations);

  logger.info('Apaleo reservations fetch finished', {
    fetched: limitedReservations.length,
    pageSize: normalizedPageSize,
    maxReservations: normalizedMaxReservations
  });

  return limitedReservations;
};

export const getReservationById = async ({
  credentials = null,
  config = null,
  reservationId
} = {}) => {
  if (!reservationId) {
    throw new Error('Apaleo reservationId is required');
  }

  logger.info('Apaleo reservation fetch by id started', {
    reservationId
  });

  try {
    const reservation = await apaleoFetch(`/booking/v1/reservations/${encodeURIComponent(reservationId)}`, {
      config: credentials || config,
      timeoutMs: Number(process.env.APALEO_TIMEOUT_MS || 15000),
      query: {
        expand: 'booker'
      }
    });

    logger.info('Apaleo reservation fetched by id', {
      reservationId
    });

    return reservation;
  } catch (error) {
    if (error.status === 404) {
      logger.warn('Apaleo reservation not found by id', {
        reservationId
      });
      return null;
    }

    throw error;
  }
};
