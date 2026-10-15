import { BasePmsConnector } from '../base-pms-connector.js';
import { apaleoFetch } from '../../apaleo/apaleo-client.service.js';
import { syncReservationsFromApaleo } from '../../apaleo/apaleo-sync.service.js';

export class ApaleoPmsConnector extends BasePmsConnector {
  constructor(options = {}) {
    super({ ...options, provider: 'apaleo' });
  }

  async connect() {
    const property = await apaleoFetch('/inventory/v1/properties/'+encodeURIComponent(this.config.propertyId),{config:this.config});
    if(property?.id!==this.config.propertyId) throw new Error('PMS_PROPERTY_MISMATCH');

    return {
      ok: true,
      provider: this.provider,
      status: 'access_checked',
      message: 'Property read checked; persistent evidence must be recorded by the connection service'
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
      ok: false,
      provider: this.provider,
      status: 'unverified',
      message: 'Connector registered; this does not verify the hotel connection'
    };
  }
}
