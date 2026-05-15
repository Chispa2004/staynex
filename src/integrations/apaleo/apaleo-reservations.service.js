import { apaleoFetch } from './apaleo-client.service.js';
import { logger } from '../../utils/logger.js';

const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 20;

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
  pageSize = MAX_PAGE_SIZE
} = {}) => {
  const reservations = [];
  const normalizedPageSize = Math.min(Math.max(Number(pageSize) || MAX_PAGE_SIZE, 1), 200);

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const payload = await apaleoFetch('/booking/v1/reservations', {
      config,
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

  return reservations;
};
