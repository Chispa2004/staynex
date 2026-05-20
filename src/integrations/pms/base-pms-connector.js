export class BasePmsConnector {
  constructor({ provider, config = {}, logger = console } = {}) {
    this.provider = provider || 'unknown';
    this.config = config;
    this.logger = logger;
  }

  async connect() {
    return this.healthCheck();
  }

  async syncReservations() {
    throw new Error(`${this.provider} syncReservations is not implemented yet`);
  }

  async syncRooms() {
    throw new Error(`${this.provider} syncRooms is not implemented yet`);
  }

  async syncGuests() {
    throw new Error(`${this.provider} syncGuests is not implemented yet`);
  }

  async syncOccupancy() {
    throw new Error(`${this.provider} syncOccupancy is not implemented yet`);
  }

  async healthCheck() {
    return {
      ok: false,
      provider: this.provider,
      status: 'placeholder',
      message: `${this.provider} adapter scaffold is registered, but live API operations are not enabled yet`
    };
  }
}
