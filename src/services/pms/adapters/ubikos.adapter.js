import { UBIKOS_MOCK_DATA } from '../mocks/ubikos.mock.js';
import {
  normalizeUbikosFolio,
  normalizeUbikosGuest,
  normalizeUbikosHotelStatus,
  normalizeUbikosReservation,
  normalizeUbikosRoom
} from '../normalizers/ubikos.normalizer.js';

const trueValues = new Set(['true', '1', 'yes', 'y', true]);

const envFlag = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return trueValues.has(String(value).trim().toLowerCase());
};

const normalizeSearch = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

export class UbikosAdapter {
  constructor({ config = {}, logger = console, mockData = UBIKOS_MOCK_DATA } = {}) {
    this.provider = 'ubikos';
    this.logger = logger;
    this.mockData = mockData;
    this.config = {
      enabled: envFlag(config.enabled ?? process.env.UBIKOS_ENABLED, false),
      sandbox: envFlag(config.sandbox ?? process.env.UBIKOS_SANDBOX, true),
      readOnly: envFlag(config.readOnly ?? config.read_only ?? process.env.UBIKOS_READ_ONLY, true),
      baseUrl: config.baseUrl || config.base_url || process.env.UBIKOS_BASE_URL || 'https://cloud.ubikos.es',
      apiBaseUrl: config.apiBaseUrl || config.api_base_url || process.env.UBIKOS_API_BASE_URL || '',
      clientId: config.clientId || config.client_id || process.env.UBIKOS_CLIENT_ID || '',
      clientSecret: config.clientSecret || config.client_secret || process.env.UBIKOS_CLIENT_SECRET || '',
      username: config.username || process.env.UBIKOS_USERNAME || '',
      password: config.password || process.env.UBIKOS_PASSWORD || '',
      hotelId: config.hotelId || config.hotel_id || process.env.UBIKOS_HOTEL_ID || '',
      timeoutMs: Number(config.timeoutMs || config.timeout_ms || process.env.UBIKOS_TIMEOUT_MS || 15000)
    };
  }

  get configured() {
    const hasApiBase = Boolean(this.config.apiBaseUrl);
    const hasHotel = Boolean(this.config.hotelId);
    const hasClientCredentials = Boolean(this.config.clientId && this.config.clientSecret);
    const hasUserCredentials = Boolean(this.config.username && this.config.password);
    return Boolean(hasApiBase && hasHotel && (hasClientCredentials || hasUserCredentials));
  }

  assertReadOnly() {
    if (!this.config.readOnly) {
      const error = new Error('Ubikos adapter is fail-closed: write mode is not allowed in phase 1');
      error.code = 'UBIKOS_WRITE_MODE_NOT_ALLOWED';
      throw error;
    }
  }

  getPhaseWarning() {
    return this.config.sandbox
      ? 'ubikos_sandbox_mock_data'
      : 'ubikos_live_api_not_implemented_phase_1';
  }

  async getConnectionHealth() {
    const warnings = [
      !this.config.enabled ? 'ubikos_disabled' : null,
      !this.config.readOnly ? 'read_only_disabled_blocked' : null,
      !this.config.apiBaseUrl ? 'api_base_url_missing' : null,
      !this.config.hotelId ? 'hotel_id_missing' : null,
      !(this.config.clientId && this.config.clientSecret) && !(this.config.username && this.config.password) ? 'credentials_missing' : null,
      this.getPhaseWarning()
    ].filter(Boolean);
    const status = this.config.readOnly === false
      ? 'blocked'
      : this.config.sandbox
        ? (this.config.enabled && this.configured ? 'sandbox_configured' : 'not_configured')
        : 'live_api_not_implemented';

    return {
      ok: this.config.readOnly !== false && (this.config.sandbox || this.configured),
      provider: this.provider,
      status,
      enabled: this.config.enabled,
      sandbox: this.config.sandbox,
      readOnly: this.config.readOnly,
      configured: this.configured,
      reachable: Boolean(this.config.sandbox),
      lastCheckAt: new Date().toISOString(),
      baseUrl: this.config.baseUrl,
      apiBaseUrlConfigured: Boolean(this.config.apiBaseUrl),
      warnings
    };
  }

  async searchReservations({ query = '', filters = {} } = {}) {
    this.assertReadOnly();
    if (!this.config.sandbox) return [];

    const needle = normalizeSearch(query);
    const rows = this.mockData.reservations.map(normalizeUbikosReservation);
    const filtered = rows.filter((reservation) => {
      const matchesQuery = !needle || [
        reservation.reservation_id,
        reservation.locator,
        reservation.guest_name,
        reservation.guest_phone,
        reservation.guest_email,
        reservation.room_number,
        reservation.status
      ].some((value) => normalizeSearch(value).includes(needle));
      const matchesStatus = !filters.status || reservation.status === filters.status;
      const matchesRoom = !filters.roomNumber || String(reservation.room_number) === String(filters.roomNumber);
      return matchesQuery && matchesStatus && matchesRoom;
    });

    return filtered.map((reservation) => ({
      ...reservation,
      warnings: [...reservation.warnings, this.getPhaseWarning()]
    }));
  }

  async getReservationDetails(reservationId) {
    this.assertReadOnly();
    if (!this.config.sandbox) return null;
    const raw = this.mockData.reservations.find((reservation) => String(reservation.id) === String(reservationId) || String(reservation.localizador) === String(reservationId));
    return raw ? normalizeUbikosReservation(raw) : null;
  }

  async getArrivalsToday({ date = new Date() } = {}) {
    const target = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
    const reservations = await this.searchReservations();
    return reservations.filter((reservation) => reservation.arrival_date === target);
  }

  async getDeparturesToday({ date = new Date() } = {}) {
    const target = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
    const reservations = await this.searchReservations();
    return reservations.filter((reservation) => reservation.departure_date === target);
  }

  async getInHouseGuests() {
    this.assertReadOnly();
    if (!this.config.sandbox) return [];
    const occupiedRooms = this.mockData.rooms
      .filter((room) => room.estado === 'ocupada')
      .map(normalizeUbikosRoom);
    return occupiedRooms.map((room) => ({
      room_number: room.room_number,
      guest_name: room.guest_name,
      current_reservation_id: room.current_reservation_id,
      status: 'in_house',
      warnings: room.warnings
    }));
  }

  async getRooms() {
    this.assertReadOnly();
    if (!this.config.sandbox) return [];
    return this.mockData.rooms.map(normalizeUbikosRoom);
  }

  async getRoomStatus(roomNumber = null) {
    const rooms = await this.getRooms();
    if (!roomNumber) {
      return {
        provider: this.provider,
        hotel_status: normalizeUbikosHotelStatus(this.mockData.hotelStatus),
        rooms
      };
    }

    return rooms.find((room) => String(room.room_number) === String(roomNumber)) || null;
  }

  async getGuestProfile(guestId) {
    this.assertReadOnly();
    if (!this.config.sandbox) return null;
    const raw = this.mockData.guests.find((guest) => String(guest.id) === String(guestId) || normalizeSearch(guest.nombre).includes(normalizeSearch(guestId)));
    return raw ? normalizeUbikosGuest(raw) : null;
  }

  async getFolioSummary(reservationId) {
    this.assertReadOnly();
    if (!this.config.sandbox) {
      return {
        available: false,
        provider: this.provider,
        dataQuality: 'missing',
        warnings: ['ubikos_live_folio_not_implemented_phase_1']
      };
    }

    const raw = this.mockData.folios.find((folio) => String(folio.reserva_id) === String(reservationId) || String(folio.reservation_id) === String(reservationId));
    if (!raw) {
      return {
        available: false,
        provider: this.provider,
        dataQuality: 'missing',
        warnings: ['folio_not_found_in_ubikos_sandbox']
      };
    }

    const folio = normalizeUbikosFolio(raw);
    return {
      available: true,
      provider: this.provider,
      reservationId: folio.reservation_id,
      totalCharges: folio.total_charges,
      totalPaid: folio.total_paid,
      outstandingBalance: folio.balance_due,
      currency: folio.currency,
      lineItems: folio.charges,
      payments: folio.payments,
      lastUpdatedAt: new Date().toISOString(),
      dataQuality: folio.warnings.length ? 'medium' : 'high',
      warnings: folio.warnings,
      rawFolio: folio
    };
  }
}

export const createUbikosAdapter = (options = {}) => new UbikosAdapter(options);
