import 'server-only';
import {createUbikosObservationReader} from '../../src/services/pms/ubikos/observation-reader.js';

// No NEXT_PUBLIC variables, DPAPI access or browser-selected configuration.
// Disabled unless all four server settings are present and valid.
export const ubikosObservationReader = createUbikosObservationReader({
  enabled: process.env.UBIKOS_MANUAL_READ_ENABLED === 'true',
  hotelId: process.env.UBIKOS_MANUAL_READ_HOTEL_ID,
  connectionId: process.env.UBIKOS_MANUAL_READ_CONNECTION_ID,
  apiKey: process.env.UBIKOS_MANUAL_READ_API_KEY
});
