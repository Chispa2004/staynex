import { createPmsConnector } from '../integrations/pms/registry.js';
import { isHumanControlledConversation } from './conversation-context.service.js';
import { getSupabase } from './supabase.service.js';
import { logger } from '../utils/logger.js';

export const PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE = 'pre_checkout_folio_reminder';

const ACTIVE_RESERVATION_STATUSES = new Set(['confirmed', 'checked_in', 'in_house']);
const VALID_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'MAD']);

const currencySymbols = {
  EUR: 'EUR',
  USD: '$',
  GBP: 'GBP',
  MAD: 'MAD'
};

const isMissingAutomationTables = (error) => (
  error?.message?.includes('scheduled_messages')
  || error?.message?.includes('automation_runs')
  || error?.details?.includes('scheduled_messages')
  || error?.details?.includes('automation_runs')
  || error?.hint?.includes('scheduled_messages')
  || error?.hint?.includes('automation_runs')
);

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeCurrency = (value) => {
  const currency = String(value || '').trim().toUpperCase();
  return VALID_CURRENCIES.has(currency) ? currency : null;
};

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeLineItem = (item = {}) => ({
  description: String(item.description || item.name || item.label || '').trim(),
  category: String(item.category || item.type || 'other').trim().toLowerCase(),
  amount: toNumber(item.amount),
  date: normalizeDate(item.date || item.posted_at || item.created_at),
  status: String(item.status || 'posted').trim().toLowerCase()
});

export const normalizeFolioSummary = (raw = {}) => {
  if (!raw || typeof raw !== 'object') {
    return {
      available: false,
      dataQuality: 'missing',
      warnings: ['folio_missing'],
      lineItems: []
    };
  }

  if (raw.available === false) {
    return {
      available: false,
      totalCharges: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      currency: normalizeCurrency(raw.currency),
      lineItems: [],
      lastUpdatedAt: normalizeDate(raw.lastUpdatedAt || raw.last_updated_at) || null,
      dataQuality: raw.dataQuality || raw.data_quality || 'missing',
      warnings: raw.warnings?.length ? raw.warnings : ['folio_unavailable'],
      error: raw.error || null
    };
  }

  const lineItems = (raw.lineItems || raw.line_items || raw.charges || [])
    .map(normalizeLineItem)
    .filter((item) => item.description && Number.isFinite(item.amount));
  const currency = normalizeCurrency(raw.currency);
  const totalCharges = raw.totalCharges ?? raw.total_charges ?? lineItems.reduce((sum, item) => sum + item.amount, 0);
  const totalPaid = raw.totalPaid ?? raw.total_paid ?? raw.payments_total ?? 0;
  const outstandingBalance = raw.outstandingBalance ?? raw.outstanding_balance ?? (toNumber(totalCharges) - toNumber(totalPaid));
  const warnings = [
    !currency ? 'currency_unknown' : null,
    !lineItems.length ? 'line_items_missing' : null,
    lineItems.some((item) => item.amount < 0) ? 'negative_charge_line_item' : null,
    Math.abs(lineItems.reduce((sum, item) => sum + item.amount, 0) - toNumber(totalCharges)) > 0.05 ? 'charge_total_mismatch' : null,
    toNumber(outstandingBalance) < 0 ? 'negative_outstanding_balance' : null,
    ...(raw.warnings || [])
  ].filter(Boolean);
  const criticalWarnings = new Set([
    'currency_unknown',
    'line_items_missing',
    'negative_charge_line_item',
    'charge_total_mismatch',
    'negative_outstanding_balance',
    'pms_timeout',
    'folio_inconsistent'
  ]);
  const dataQuality = raw.dataQuality || raw.data_quality || (
    warnings.some((warning) => criticalWarnings.has(warning)) ? 'low' : 'high'
  );

  return {
    available: true,
    totalCharges: Number(toNumber(totalCharges).toFixed(2)),
    totalPaid: Number(toNumber(totalPaid).toFixed(2)),
    outstandingBalance: Number(toNumber(outstandingBalance).toFixed(2)),
    currency,
    lineItems,
    lastUpdatedAt: normalizeDate(raw.lastUpdatedAt || raw.last_updated_at) || new Date().toISOString(),
    dataQuality,
    warnings
  };
};

const findMockFolio = ({ connection, reservationId, roomNumber }) => {
  const metadata = connection?.metadata || {};
  const folios = metadata.folio_summaries
    || metadata.folioSummaries
    || metadata.room_folios
    || metadata.reservation_folios
    || {};

  if (Array.isArray(folios)) {
    return folios.find((item) => (
      item.reservation_id === reservationId
      || item.reservationId === reservationId
      || String(item.room_number || item.roomNumber || '') === String(roomNumber || '')
    ));
  }

  return folios[reservationId]
    || folios[String(roomNumber || '')]
    || metadata.mock_folio_summary
    || metadata.mockFolioSummary
    || null;
};

const getEnabledPmsConnection = async ({ hotelId, supabase }) => {
  const { data, error } = await supabase
    .from('hotel_pms_connections')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

export const getGuestFolioSummary = async ({
  hotelId,
  reservationId = null,
  roomNumber = null,
  connection = null,
  folioProvider = null,
  supabase = null
} = {}) => {
  if (!hotelId) {
    return normalizeFolioSummary({ available: false, warnings: ['missing_hotel_id'] });
  }

  try {
    const client = supabase || (connection ? null : getSupabase());
    const pmsConnection = connection || await getEnabledPmsConnection({ hotelId, supabase: client });

    if (!pmsConnection) {
      logger.info('folio_missing', { hotelId, reason: 'pms_not_connected' });
      return {
        ...normalizeFolioSummary({ available: false, warnings: ['pms_not_connected'] }),
        provider: null
      };
    }

    let rawFolio = null;

    if (typeof folioProvider === 'function') {
      rawFolio = await folioProvider({ hotelId, reservationId, roomNumber, connection: pmsConnection });
    } else {
      rawFolio = findMockFolio({ connection: pmsConnection, reservationId, roomNumber });

      if (!rawFolio) {
        const connector = createPmsConnector(pmsConnection.provider, { config: pmsConnection.metadata || {} });
        if (connector?.getGuestFolioSummary) {
          rawFolio = await connector.getGuestFolioSummary({
            hotelId,
            reservationId,
            roomNumber,
            connection: pmsConnection
          });
        }
      }
    }

    if (!rawFolio?.available && !rawFolio?.lineItems && !rawFolio?.line_items && !rawFolio?.charges) {
      logger.info('folio_missing', {
        hotelId,
        reservationId,
        roomNumber,
        provider: pmsConnection.provider
      });
      return {
        ...normalizeFolioSummary(rawFolio || { available: false, warnings: ['folio_unavailable'] }),
        provider: pmsConnection.provider
      };
    }

    const folio = {
      ...normalizeFolioSummary(rawFolio),
      provider: pmsConnection.provider
    };

    logger.info('folio_retrieved', {
      hotelId,
      reservationId,
      roomNumber,
      provider: pmsConnection.provider,
      outstandingBalance: folio.outstandingBalance,
      dataQuality: folio.dataQuality
    });

    return folio;
  } catch (error) {
    logger.warn('pms_folio_error', {
      hotelId,
      reservationId,
      roomNumber,
      message: error.message
    });

    return {
      ...normalizeFolioSummary({ available: false, warnings: ['pms_folio_error', error.message] }),
      error: error.message
    };
  }
};

const isValidPhone = (value) => String(value || '').replace(/\D/g, '').length >= 8;

const checkoutDateTime = (reservation = {}) => {
  if (!reservation.departure_date) return null;
  const value = String(reservation.departure_date).includes('T')
    ? reservation.departure_date
    : `${reservation.departure_date}T11:00:00.000Z`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isPreCheckoutFolioEligibleWindow = ({ reservation = {}, now = new Date() } = {}) => {
  const checkout = checkoutDateTime(reservation);
  if (!checkout) return false;
  const hours = (checkout.getTime() - now.getTime()) / 3600000;
  return hours > 0 && hours <= 24;
};

const formatAmount = (amount, currency) => {
  const symbol = currencySymbols[currency] || currency;
  const value = new Intl.NumberFormat('es', {
    minimumFractionDigits: Number.isInteger(Number(amount)) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(Number(amount || 0));

  return currency === 'USD'
    ? `${symbol}${value}`
    : `${value} ${symbol}`;
};

export const buildPreCheckoutFolioReminderMessage = ({
  hotel = {},
  reservation = {},
  folio,
  language = 'es'
} = {}) => {
  const normalizedLanguage = ['es', 'en', 'fr', 'de'].includes(language) ? language : 'es';

  if (!folio?.available || !folio.currency || folio.outstandingBalance <= 0 || folio.dataQuality === 'low') {
    return null;
  }

  const items = folio.lineItems
    .filter((item) => item.amount > 0)
    .map((item) => `- ${item.description}: ${formatAmount(item.amount, folio.currency)}`)
    .join('\n');
  const total = formatAmount(folio.outstandingBalance, folio.currency);
  const guestName = String(reservation.guest_name || '').split(' ')[0];
  const prefix = guestName ? `${guestName}, ` : '';

  const templates = {
    es: `${prefix}le recordamos que manana esta previsto su check-out en ${hotel.name || 'el hotel'}.\n\nSegun la informacion actual de su habitacion, figura pendiente:\n\n${items}\n\nTotal pendiente estimado: ${total}\n\nEste resumen puede actualizarse si se anaden nuevos consumos antes del check-out. Si tiene cualquier duda, recepcion puede ayudarle.`,
    en: `${prefix}this is a friendly reminder that your check-out is scheduled for tomorrow at ${hotel.name || 'the hotel'}.\n\nAccording to the current room account information, the following items are pending:\n\n${items}\n\nEstimated pending total: ${total}\n\nThis summary may change if new charges are added before check-out. If you have any questions, reception will be happy to help.`,
    fr: `${prefix}nous vous rappelons que votre check-out est prevu demain a ${hotel.name || "l'hotel"}.\n\nSelon les informations actuelles de votre chambre, les elements suivants restent en attente:\n\n${items}\n\nTotal estime en attente: ${total}\n\nCe resume peut evoluer si de nouvelles consommations sont ajoutees avant le check-out. La reception reste a votre disposition.`,
    de: `${prefix}wir erinnern Sie freundlich daran, dass Ihr Check-out morgen im ${hotel.name || 'Hotel'} geplant ist.\n\nLaut aktuellem Zimmerkonto sind folgende Posten offen:\n\n${items}\n\nGeschaetzter offener Gesamtbetrag: ${total}\n\nDiese Uebersicht kann sich aendern, falls vor dem Check-out weitere Leistungen hinzukommen. Die Rezeption hilft Ihnen gern bei Fragen.`
  };

  return templates[normalizedLanguage];
};

export const evaluatePreCheckoutFolioReminder = ({
  hotel = {},
  reservation = {},
  guest = null,
  conversationState = null,
  folio = null,
  existingScheduledMessages = [],
  now = new Date()
} = {}) => {
  if (!ACTIVE_RESERVATION_STATUSES.has(reservation.status)) {
    return { eligible: false, reason: 'reservation_not_active' };
  }

  if (!isPreCheckoutFolioEligibleWindow({ reservation, now })) {
    return { eligible: false, reason: 'checkout_not_within_24h' };
  }

  const phone = reservation.guest_phone || guest?.phone_number;
  if (!isValidPhone(phone)) {
    return { eligible: false, reason: 'guest_phone_invalid' };
  }

  if (isHumanControlledConversation(conversationState)) {
    return { eligible: false, reason: 'human_takeover_active' };
  }

  if (guest?.opt_out || guest?.metadata?.opt_out || reservation.metadata?.guest_opt_out) {
    return { eligible: false, reason: 'guest_opt_out' };
  }

  if (existingScheduledMessages.some((message) => (
    message.reservation_id === reservation.id
    && message.automation_type === PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE
    && ['scheduled', 'preview', 'sent'].includes(message.status)
  ))) {
    return { eligible: false, reason: 'duplicate_reminder' };
  }

  if (!folio?.available) {
    return { eligible: false, reason: 'folio_missing' };
  }

  if (!folio.currency) {
    return { eligible: false, reason: 'currency_unknown' };
  }

  if (folio.dataQuality === 'low' || folio.warnings?.length) {
    return { eligible: false, reason: 'folio_data_quality_low' };
  }

  if (Number(folio.outstandingBalance || 0) <= 0) {
    return { eligible: false, reason: 'no_outstanding_balance' };
  }

  const language = guest?.preferred_language || reservation.language || hotel.default_language || 'es';
  const message = buildPreCheckoutFolioReminderMessage({ hotel, reservation, folio, language });

  if (!message) {
    return { eligible: false, reason: 'message_not_generated' };
  }

  return {
    eligible: true,
    reason: 'eligible',
    language,
    sendTo: phone,
    message,
    previewOnly: true
  };
};

const safeRows = async (query, fallback = []) => {
  const { data, error } = await query;
  if (error) throw error;
  return data || fallback;
};

const insertFolioAutomationRun = async ({
  supabase,
  hotel,
  reservation,
  guest = null,
  conversation = null,
  scheduledMessage = null,
  status,
  reason = null,
  folio = null,
  now = new Date()
}) => {
  try {
    const { data, error } = await supabase
      .from('automation_runs')
      .insert({
        automation_id: null,
        hotel_id: hotel.id || reservation.hotel_id,
        guest_id: reservation.guest_id || guest?.id || null,
        reservation_id: reservation.id || null,
        conversation_id: conversation?.id || null,
        trigger_type: 'pre_checkout_folio',
        automation_type: PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE,
        message_sent: false,
        translated_language: guest?.preferred_language || reservation.language || hotel.default_language || 'es',
        converted: false,
        revenue_generated: 0,
        revenue_owner: 'hotel',
        scheduled_message_id: scheduledMessage?.id || null,
        status,
        cooldown_applied: false,
        fatigue_score: 0,
        metadata: {
          source: 'pre_checkout_folio_reminder',
          preview_only: true,
          skipped_reason: reason,
          folio_data_quality: folio?.dataQuality || null,
          folio_warnings: folio?.warnings || [],
          outstanding_balance: folio?.outstandingBalance || 0,
          live_sending_disabled: true
        },
        updated_at: now.toISOString()
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    if (!isMissingAutomationTables(error) && error?.code !== '42703') {
      logger.warn('pre_checkout_folio_run_log_failed', {
        hotelId: hotel.id || reservation.hotel_id,
        reservationId: reservation.id,
        message: error.message
      });
    }

    return null;
  }
};

export const runPreCheckoutFolioReminder = async ({
  hotelId = null,
  now = new Date(),
  limit = 250,
  folioProvider = null,
  supabase = getSupabase()
} = {}) => {
  const result = {
    automationType: PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE,
    eligibleGuests: 0,
    previewsGenerated: 0,
    sentCount: 0,
    skippedCount: 0,
    skippedReasons: {},
    pmsFolioErrors: 0,
    scheduledMessages: []
  };

  try {
    let reservationsQuery = supabase
      .from('reservations')
      .select('*')
      .in('status', [...ACTIVE_RESERVATION_STATUSES])
      .order('departure_date', { ascending: true })
      .limit(limit);

    if (hotelId) {
      reservationsQuery = reservationsQuery.eq('hotel_id', hotelId);
    }

    const reservations = await safeRows(reservationsQuery);
    const candidateReservations = reservations.filter((reservation) => isPreCheckoutFolioEligibleWindow({ reservation, now }));
    const hotelIds = [...new Set(candidateReservations.map((reservation) => reservation.hotel_id).filter(Boolean))];
    const guestIds = [...new Set(candidateReservations.map((reservation) => reservation.guest_id).filter(Boolean))];
    const reservationIds = candidateReservations.map((reservation) => reservation.id).filter(Boolean);
    const [hotels, guests, conversations, states, existingMessages] = await Promise.all([
      hotelIds.length ? safeRows(supabase.from('hotels').select('*').in('id', hotelIds)) : [],
      guestIds.length ? safeRows(supabase.from('guests').select('*').in('id', guestIds)) : [],
      guestIds.length ? safeRows(supabase.from('conversations').select('*').in('guest_id', guestIds)) : [],
      guestIds.length ? safeRows(supabase.from('conversation_ai_state').select('*').in('guest_id', guestIds)).catch(() => []) : [],
      reservationIds.length ? safeRows(supabase.from('scheduled_messages').select('*').in('reservation_id', reservationIds)).catch(() => []) : []
    ]);
    const hotelsById = new Map(hotels.map((hotel) => [hotel.id, hotel]));
    const guestsById = new Map(guests.map((guest) => [guest.id, guest]));
    const conversationsByGuestId = new Map(conversations.map((conversation) => [conversation.guest_id, conversation]));
    const statesByConversationId = new Map(states.map((state) => [state.conversation_id, state]));

    for (const reservation of candidateReservations) {
      const hotel = hotelsById.get(reservation.hotel_id) || { id: reservation.hotel_id };
      const guest = guestsById.get(reservation.guest_id) || null;
      const conversation = conversationsByGuestId.get(reservation.guest_id) || null;
      const conversationState = conversation ? statesByConversationId.get(conversation.id) : null;
      const folio = await getGuestFolioSummary({
        hotelId: reservation.hotel_id,
        reservationId: reservation.id,
        roomNumber: reservation.room_number || guest?.current_room,
        folioProvider,
        supabase
      });

      if (folio.error) {
        result.pmsFolioErrors += 1;
      }

      const decision = evaluatePreCheckoutFolioReminder({
        hotel,
        reservation,
        guest,
        conversationState,
        folio,
        existingScheduledMessages: existingMessages,
        now
      });

      if (!decision.eligible) {
        result.skippedCount += 1;
        result.skippedReasons[decision.reason] = (result.skippedReasons[decision.reason] || 0) + 1;
        if (decision.reason === 'folio_data_quality_low') {
          logger.warn('folio_data_quality_low', {
            hotelId: reservation.hotel_id,
            reservationId: reservation.id,
            warnings: folio?.warnings || []
          });
        }
        logger.info('pre_checkout_folio_skipped', {
          hotelId: reservation.hotel_id,
          reservationId: reservation.id,
          reason: decision.reason
        });
        await insertFolioAutomationRun({
          supabase,
          hotel,
          reservation,
          guest,
          conversation,
          status: 'skipped',
          reason: decision.reason,
          folio,
          now
        });
        continue;
      }

      result.eligibleGuests += 1;
      const record = {
        hotel_id: reservation.hotel_id,
        reservation_id: reservation.id,
        guest_id: reservation.guest_id || null,
        conversation_id: conversation?.id || null,
        automation_rule_id: null,
        automation_type: PRE_CHECKOUT_FOLIO_AUTOMATION_TYPE,
        channel: 'whatsapp',
        scheduled_for: now.toISOString(),
        send_to: decision.sendTo,
        language: decision.language,
        message_preview: decision.message,
        status: 'preview',
        ai_provider: 'none',
        ai_model: 'pms_folio_template',
        automation_fallback: false,
        metadata: {
          source: 'pre_checkout_folio_reminder',
          preview_only: true,
          send_automations: process.env.SEND_AUTOMATIONS === 'true',
          live_sending_disabled: true,
          folio_last_updated_at: folio.lastUpdatedAt,
          folio_data_quality: folio.dataQuality,
          folio_currency: folio.currency,
          outstanding_balance: folio.outstandingBalance,
          line_item_count: folio.lineItems.length
        },
        updated_at: now.toISOString()
      };

      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert(record)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      existingMessages.push(data);
      result.scheduledMessages.push(data);
      result.previewsGenerated += 1;
      await insertFolioAutomationRun({
        supabase,
        hotel,
        reservation,
        guest,
        conversation,
        scheduledMessage: data,
        status: 'preview',
        folio,
        now
      });
      logger.info('pre_checkout_folio_preview_generated', {
        hotelId: reservation.hotel_id,
        reservationId: reservation.id,
        scheduledMessageId: data.id
      });
    }

    return result;
  } catch (error) {
    if (isMissingAutomationTables(error)) {
      logger.warn('pre_checkout_folio_scheduler_skipped_missing_tables', { message: error.message });
      return result;
    }

    logger.warn('pms_folio_error', { message: error.message });
    throw error;
  }
};
