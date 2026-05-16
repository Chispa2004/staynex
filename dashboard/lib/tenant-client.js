import { getActiveWorkspace } from './workspace-context';

export const getActiveTenantId = () => getActiveWorkspace().hotelId || null;

export const getPayloadTenantId = (payload = {}) => (
  payload.hotelId
  || payload.hotel_id
  || payload.hotel?.id
  || payload.analytics?.hotelId
  || payload.data?.hotel?.id
  || null
);

export const resetTenantLocalState = (setters = []) => {
  setters.forEach((setter) => {
    try {
      setter();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('tenant local state reset failed', error);
      }
    }
  });
};

export const shouldAcceptTenantPayload = (payload, surface = 'unknown') => {
  const activeHotelId = getActiveTenantId();
  const payloadHotelId = getPayloadTenantId(payload);

  if (activeHotelId && payloadHotelId && activeHotelId !== payloadHotelId) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('cross-tenant payload blocked', {
        surface,
        activeHotelId,
        payloadHotelId
      });
    }

    return false;
  }

  return true;
};
