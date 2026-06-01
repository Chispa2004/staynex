import { BasePmsConnector } from '../base-pms-connector.js';
import { createUbikosAdapter } from '../../../services/pms/adapters/ubikos.adapter.js';

export class UbikosPmsConnector extends BasePmsConnector {
  constructor(options = {}) {
    super({ ...options, provider: 'ubikos' });
    this.adapter = createUbikosAdapter(options);
  }

  async connect() {
    return this.healthCheck();
  }

  async healthCheck() {
    return this.adapter.getConnectionHealth();
  }

  async searchReservations(options = {}) {
    return this.adapter.searchReservations(options);
  }

  async getReservationDetails(reservationId) {
    return this.adapter.getReservationDetails(reservationId);
  }

  async getArrivalsToday(options = {}) {
    return this.adapter.getArrivalsToday(options);
  }

  async getDeparturesToday(options = {}) {
    return this.adapter.getDeparturesToday(options);
  }

  async getInHouseGuests() {
    return this.adapter.getInHouseGuests();
  }

  async syncReservations() {
    return {
      provider: this.provider,
      readOnly: true,
      synced: 0,
      skipped: true,
      warning: 'ubikos_sync_disabled_phase_1_read_only'
    };
  }

  async syncRooms() {
    return {
      provider: this.provider,
      readOnly: true,
      synced: 0,
      skipped: true,
      warning: 'ubikos_room_sync_disabled_phase_1_read_only'
    };
  }

  async syncGuests() {
    return {
      provider: this.provider,
      readOnly: true,
      synced: 0,
      skipped: true,
      warning: 'ubikos_guest_sync_disabled_phase_1_read_only'
    };
  }

  async syncOccupancy() {
    const status = await this.adapter.getRoomStatus();
    return {
      provider: this.provider,
      readOnly: true,
      previewOnly: true,
      occupancy: status.hotel_status,
      warning: 'ubikos_occupancy_sync_preview_only_phase_1'
    };
  }

  async getRooms() {
    return this.adapter.getRooms();
  }

  async getRoomStatus(roomNumber = null) {
    return this.adapter.getRoomStatus(roomNumber);
  }

  async getGuestProfile(guestId) {
    return this.adapter.getGuestProfile(guestId);
  }

  async getGuestFolioSummary({ reservationId } = {}) {
    return this.adapter.getFolioSummary(reservationId);
  }

  async getFolioSummary(reservationId) {
    return this.adapter.getFolioSummary(reservationId);
  }
}
