import {getCurrentHotelForRequest} from '@/lib/current-hotel';
import {canAccess} from '@/lib/permissions';
import {assertPmsHotelContext} from '@/lib/pms-connections';
import {createUbikosObservationHandler} from '@/lib/ubikos-observations-server';
import {ubikosObservationReader} from '@/lib/ubikos-observation-transport';

const handle = createUbikosObservationHandler({
  getContext: getCurrentHotelForRequest, canAccess, assertContext: assertPmsHotelContext,
  reader: ubikosObservationReader
});
export const GET = handle;
export const POST = handle;
