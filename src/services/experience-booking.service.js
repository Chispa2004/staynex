import { getSupabase } from './supabase.service.js';
import { upsertGuestMemory } from './guest-memory.service.js';
import { createConversion } from './revenue.service.js';
import {
  buildExperienceProviderLeadEmail,
  sendExperienceProviderLeadEmail
} from './provider-lead-email.service.js';
import { logger } from '../utils/logger.js';

const normalize = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const isMissingBookingTable = (error) => (
  error?.message?.includes('experience_booking_requests')
  || error?.details?.includes('experience_booking_requests')
  || error?.hint?.includes('experience_booking_requests')
);

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

const bookingIntentWords = [
  'yes',
  'book',
  'booking',
  'reserve',
  'reservation',
  'we want',
  'we would love',
  'interested',
  'sounds good',
  'can we do it',
  'can you book',
  'table',
  'si',
  'reservar',
  'reservarlo',
  'queremos',
  'nos interesa',
  'nos gustaria',
  'podemos hacerlo',
  'puedes reservar',
  'mesa'
];

const negativeWords = [
  'not now',
  'later',
  'cancel',
  'not interested',
  'no gracias',
  'cancelar',
  'ahora no'
];

const experienceWords = [
  'catamaran',
  'catamaran',
  'boat',
  'barco',
  'excursion',
  'experience',
  'experiencia',
  'restaurant',
  'restaurante',
  'dinner',
  'cena',
  'spa',
  'transfer',
  'beach club',
  'yacht',
  'yate',
  'tour'
];

const dateFromMessage = (message = '') => {
  const text = normalize(message);
  const today = new Date();
  const date = new Date(today);

  if (text.includes('tomorrow') || text.includes('manana')) {
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  if (text.includes('today') || text.includes('hoy')) {
    return date.toISOString().slice(0, 10);
  }

  const isoMatch = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    return isoMatch[1];
  }

  return null;
};

const timeFromMessage = (message = '') => {
  const timeMatch = message.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  const amPmMatch = message.match(/\b(1[0-2]|0?[1-9])\s?(am|pm)\b/i);
  if (!amPmMatch) {
    return null;
  }

  let hour = Number(amPmMatch[1]);
  if (amPmMatch[2].toLowerCase() === 'pm' && hour < 12) hour += 12;
  if (amPmMatch[2].toLowerCase() === 'am' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:00`;
};

const guestsCountFromMessage = (message = '') => {
  const countMatch = message.match(/\b(?:for|para)\s+(\d{1,2})\b/i) || message.match(/\b(\d{1,2})\s+(?:people|guests|personas|pax)\b/i);

  return countMatch ? Number(countMatch[1]) : null;
};

const wordsForExperience = (experience = {}) => [
  experience.title,
  experience.slug,
  experience.category,
  experience.partner_name,
  experience.provider_source,
  ...(experience.tags || []),
  ...(experience.target_guest_types || [])
].filter(Boolean).map(normalize);

const getLatestExperienceOffer = async ({ conversationId }) => {
  if (!conversationId) {
    return null;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ai_offers')
      .select('*')
      .eq('conversation_id', conversationId)
      .in('status', ['suggested', 'sent'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    return (data || []).find((offer) => offer.metadata?.experience_intelligence) || null;
  } catch (error) {
    logger.warn('Recent experience offer lookup failed', { message: error.message });
    return null;
  }
};

const matchHotelExperience = ({ message, hotelExperiences = [], latestOffer = null }) => {
  const text = normalize(message);
  const offeredExperienceId = latestOffer?.metadata?.hotel_experience_id;

  if (offeredExperienceId) {
    const offered = hotelExperiences.find((experience) => experience.id === offeredExperienceId);
    if (offered) return offered;
  }

  return hotelExperiences.find((experience) => wordsForExperience(experience).some((word) => (
    word.length >= 4 && text.includes(word)
  ))) || null;
};

export const detectExperienceBookingIntent = async ({
  message = '',
  conversationId = null,
  hotelExperiences = []
} = {}) => {
  const text = normalize(message);

  if (!text || includesAny(text, negativeWords)) {
    return { detected: false, confidence: 0, reason: 'negative_or_empty' };
  }

  const latestOffer = await getLatestExperienceOffer({ conversationId });
  const matchedExperience = matchHotelExperience({ message, hotelExperiences, latestOffer });
  const hasBookingLanguage = includesAny(text, bookingIntentWords);
  const mentionsExperience = includesAny(text, experienceWords) || Boolean(matchedExperience);
  const followsExperienceOffer = Boolean(latestOffer && hasBookingLanguage);

  if (!((hasBookingLanguage && mentionsExperience) || followsExperienceOffer)) {
    return { detected: false, confidence: 0, reason: 'no_booking_intent' };
  }

  return {
    detected: true,
    confidence: followsExperienceOffer ? 0.88 : 0.78,
    reason: followsExperienceOffer ? 'accepted_recent_experience_offer' : 'explicit_experience_booking',
    latestOffer,
    matchedExperience,
    requestedDate: dateFromMessage(message),
    requestedTime: timeFromMessage(message),
    guestsCount: guestsCountFromMessage(message)
  };
};

const getExperienceFromOffer = ({ intent, hotelExperiences = [] }) => {
  if (intent.matchedExperience) {
    return intent.matchedExperience;
  }

  const id = intent.latestOffer?.metadata?.hotel_experience_id;
  return id ? hotelExperiences.find((experience) => experience.id === id) || null : null;
};

export const createExperienceBookingRequest = async ({
  hotel,
  guest,
  conversation,
  reservation = null,
  message = '',
  hotelExperiences = [],
  intent
}) => {
  if (!intent?.detected || !hotel?.id || !conversation?.id) {
    return null;
  }

  const experience = getExperienceFromOffer({ intent, hotelExperiences });
  const latestOffer = intent.latestOffer || null;
  const title = experience?.title || latestOffer?.metadata?.hotel_experience_title || latestOffer?.offer_type || 'Local experience';
  const estimatedRevenue = Number(experience?.price ?? latestOffer?.suggested_price ?? 0);
  const commissionPercentage = Number(experience?.commission_percentage || 0);
  const commissionEstimate = commissionPercentage > 0
    ? Math.round((estimatedRevenue * commissionPercentage) / 100)
    : 0;
  const providerId = experience?.provider_id || latestOffer?.metadata?.provider_id || null;
  const providerExperienceId = experience?.provider_experience_id || latestOffer?.metadata?.provider_experience_id || null;
  const providerSource = experience?.provider_source || latestOffer?.metadata?.provider_source || null;
  const providerLeadEmail = experience?.provider_lead_email || latestOffer?.metadata?.provider_lead_email || null;

  try {
    const supabase = getSupabase();
    const { data: existing, error: existingError } = await supabase
      .from('experience_booking_requests')
      .select('*')
      .eq('hotel_id', hotel.id)
      .eq('conversation_id', conversation.id)
      .eq('experience_title', title)
      .in('status', ['pending', 'reviewing', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return existing;
    }

    const baseRecord = {
      hotel_id: hotel.id,
      reservation_id: reservation?.id || null,
      guest_id: guest?.id || null,
      conversation_id: conversation.id,
      hotel_experience_id: experience?.metadata?.experience_provider ? null : experience?.id || null,
      experience_title: title,
      partner_name: experience?.partner_name || latestOffer?.metadata?.partner_name || null,
      guest_name: reservation?.guest_name || guest?.name || null,
      room_number: guest?.current_room || reservation?.room_number || null,
      requested_date: intent.requestedDate,
      requested_time: intent.requestedTime,
      guests_count: intent.guestsCount || reservation?.adults || null,
      notes: message,
      status: 'pending',
      estimated_revenue: estimatedRevenue,
      commission_estimate: commissionEstimate,
      source: 'ai_concierge',
      metadata: {
        intent_reason: intent.reason,
        confidence: intent.confidence,
        ai_offer_id: latestOffer?.id || null,
        offer_type: latestOffer?.offer_type || null,
        provider_id: providerId,
        provider_experience_id: providerExperienceId,
        provider_source: providerSource,
        provider_lead_email: providerLeadEmail,
        provider_lead_required: Boolean(providerLeadEmail),
        reception_confirmation_required: true,
        partner_ready: true,
        future_partner_channels: ['email', 'whatsapp', 'api']
      }
    };
    const providerRecord = providerSource ? {
      provider_id: providerId,
      provider_experience_id: providerExperienceId,
      provider_source: providerSource,
      provider_lead_email: providerLeadEmail,
      lead_status: providerLeadEmail ? 'pending' : 'not_required'
    } : {};

    let { data, error } = await supabase
      .from('experience_booking_requests')
      .insert({
        ...baseRecord,
        ...providerRecord
      })
      .select('*')
      .single();

    if (error && (
      error.message?.includes('provider_')
      || error.message?.includes('lead_')
      || error.details?.includes('provider_')
      || error.details?.includes('lead_')
    )) {
      logger.warn('Provider lead columns missing; retrying booking request without provider columns', {
        message: error.message
      });
      const fallback = await supabase
        .from('experience_booking_requests')
        .insert(baseRecord)
        .select('*')
        .single();

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      throw error;
    }

    if (providerSource) {
      const emailPayload = buildExperienceProviderLeadEmail({
        hotel,
        guest,
        reservation,
        conversation,
        bookingRequest: data,
        providerExperience: experience,
        leadEmail: providerLeadEmail
      });
      const emailResult = await sendExperienceProviderLeadEmail(emailPayload);

      try {
        const { error: leadUpdateError } = await supabase
          .from('experience_booking_requests')
          .update({
            lead_status: emailResult.status,
            lead_email_payload: emailPayload,
            lead_email_sent_at: emailResult.status === 'sent' ? new Date().toISOString() : null,
            lead_error: emailResult.status === 'failed' ? emailResult.reason : null
          })
          .eq('id', data.id);

        if (leadUpdateError && !leadUpdateError.message?.includes('lead_')) {
          logger.warn('Experience provider lead status update failed', { message: leadUpdateError.message });
        }
      } catch (leadUpdateError) {
        if (!leadUpdateError.message?.includes('lead_')) {
          logger.warn('Experience provider lead status update failed', { message: leadUpdateError.message });
        }
      }

      data = {
        ...data,
        provider_source: data.provider_source || providerSource,
        provider_lead_email: data.provider_lead_email || providerLeadEmail,
        lead_status: emailResult.status,
        lead_email_payload: emailPayload
      };
    }

    await createConversion({
      hotelId: hotel.id,
      guestId: guest?.id || null,
      reservationId: reservation?.id || null,
      conversationId: conversation.id,
      upsellType: latestOffer?.offer_type || experience?.category || 'experience_booking',
      source: 'experience_booking_request',
      status: 'pending',
      estimatedAmount: estimatedRevenue,
      currency: latestOffer?.currency || 'EUR',
      notes: `Experience booking request ${data.id}: ${title}`
    }).catch((error) => {
      logger.warn('Experience booking revenue conversion failed', { message: error.message });
    });

    if (guest?.id) {
      const memoryKey = experience?.category
        ? `booked_${experience.category}`
        : `interested_${latestOffer?.offer_type || 'experience_booking'}`;

      await upsertGuestMemory({
        hotelId: hotel.id,
        guestId: guest.id,
        reservationId: reservation?.id || null,
        memoryType: 'experience_booking',
        memoryKey,
        memoryValue: 'pending_request',
        confidence: intent.confidence || 0.8,
        source: 'experience_booking',
        metadata: {
          booking_request_id: data.id,
          experience_title: title,
          provider_source: providerSource
        }
      }).catch((error) => {
        logger.warn('Experience booking memory write failed', { message: error.message });
      });
    }

    logger.info('experience_booking_request_created', {
      hotelId: hotel.id,
      conversationId: conversation.id,
      bookingRequestId: data.id,
      experienceTitle: title,
      providerSource
    });

    return data;
  } catch (error) {
    if (isMissingBookingTable(error)) {
      logger.warn('experience_booking_requests table missing; booking workflow skipped');
      return null;
    }

    logger.warn('Experience booking request failed', { message: error.message });
    return null;
  }
};

export const getExperienceBookingConfirmationReply = ({ language = 'en' } = {}) => (
  language === 'es'
    ? 'Perfecto. He avisado a recepcion para ayudaros con la reserva y confirmar disponibilidad.'
    : "Perfect. I've notified reception so they can help with the booking and confirm availability."
);
