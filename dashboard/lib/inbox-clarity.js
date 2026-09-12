// Presentation only. These labels never authorize a response or alter filters.
export const automaticReplyPresentation = ({ pilotAiSafety, hotel } = {}) => {
  const global = pilotAiSafety?.globalStatus;
  const configured = pilotAiSafety?.hotelStatus;
  const hotelEnabled = configured?.configured ? configured.enabled : hotel?.ai_auto_reply_enabled;
  if (global?.allowed === false || hotelEnabled === false) return { state: 'off', label: 'Respuestas automáticas desactivadas' };
  if (configured?.configured === false && hotelEnabled !== true) return { state: 'unknown', label: 'Respuestas automáticas sin configurar' };
  if (global?.allowed === true && hotelEnabled === true) return { state: 'on', label: 'Respuestas automáticas habilitadas' };
  return { state: 'unknown', label: 'Respuestas automáticas sin confirmar' };
};

export const guestInitials = conversation => {
  const name = [conversation?.guestName, conversation?.guest_name, conversation?.guest?.name,
    conversation?.guest?.full_name, conversation?.reservation?.guest_name,
    conversation?.pmsIntelligenceContext?.reservation?.guestName]
    .find(value => typeof value === 'string' && /\p{L}/u.test(value));
  if (!name) return null;
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2)).toLocaleUpperCase();
};

export const languageName = (code, locale = 'es') => {
  if (typeof code !== 'string' || !code.trim()) return 'Sin confirmar';
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' }).of(code.trim());
    if (!name) return 'Sin confirmar';
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch { return 'Sin confirmar'; }
};

// Mirrors the destination source in message.service.js, NOT the reading language
// or the language of the most recent inbound message. The server rechecks it.
export const sendLanguagePresentation = (conversation, locale) => {
  const code = conversation?.guest?.preferred_language || 'es';
  return { code, label: languageName(code, locale), defaulted: !conversation?.guest?.preferred_language };
};

// This producer stores an audit message separately from the actual ai_to_guest
// reply. Missing or contradictory provenance must retain normal message rendering.
export const isKnownInternalExperienceEvent = message => {
  const metadata = message?.metadata;
  return Boolean(message?.sender_type === 'ai' && metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    && metadata.system_event === 'experience_booking_request_created'
    && !metadata.translation_direction && !metadata.manual_send
    && !metadata.response_language && !metadata.outbound_text && !metadata.twilio_sid
    && !metadata.provider_message_id && !message.provider_message_id && !message.twilio_sid);
};
