import { BasePmsConnector } from '../base-pms-connector.js';
import { getApaleoAccessToken } from '../../apaleo/apaleo-auth.service.js';
import { apaleoFetch } from '../../apaleo/apaleo-client.service.js';
import { syncReservationsFromApaleo } from '../../apaleo/apaleo-sync.service.js';

export class ApaleoPmsConnector extends BasePmsConnector {
  constructor(options = {}) {
    super({ ...options, provider: 'apaleo' });
  }

  async connect() {
    await getApaleoAccessToken({ config: this.config, forceRefresh: true });
    await apaleoFetch('/booking/v1/reservations', {
      config: this.config,
      query: {
        pageNumber: 1,
        pageSize: 1
      }
    });

    return {
      ok: true,
      provider: this.provider,
      status: 'connected',
      message: 'Apaleo credentials verified'
    };
  }

  async syncReservations(options = {}) {
    return syncReservationsFromApaleo({
      ...options,
      connection: options.connection,
      hotelId: options.hotelId
    });
  }

  async healthCheck() {
    return {
      ok: true,
      provider: this.provider,
      status: 'available',
      message: 'Apaleo production connector is registered'
    };
  }
}
