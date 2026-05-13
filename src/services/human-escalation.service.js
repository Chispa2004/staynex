const normalize = (value = '') => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const keywordGroups = [
  {
    reason: 'emergency_detected',
    words: [
      'smoke',
      'fire',
      'emergency',
      'dangerous',
      'danger',
      'accident',
      'police',
      'humo',
      'fuego',
      'incendio',
      'emergencia',
      'peligro',
      'accidente',
      'policia',
      'fumee',
      'feu',
      'urgence',
      'rauch',
      'feuer',
      'notfall'
    ]
  },
  {
    reason: 'complaint_detected',
    words: [
      'complaint',
      'angry',
      'upset',
      'unacceptable',
      'terrible',
      'refund',
      'queja',
      'enfadado',
      'enfadada',
      'muy mal',
      'nadie me ayuda',
      'reembolso',
      'devolucion',
      'reclamation',
      'mecontent',
      'remboursement',
      'beschwerde',
      'verargert',
      'ruckerstattung'
    ]
  },
  {
    reason: 'technical_issue_detected',
    words: [
      'no funciona',
      'broken',
      'not working',
      'averia',
      'dangerous',
      'kaputt',
      'funktioniert nicht',
      'ne fonctionne pas'
    ]
  }
];

const includesAny = (text, words) => words.some((word) => text.includes(normalize(word)));

export const detectHumanEscalation = ({
  message,
  aiResponse,
  knowledgeUsed = false
}) => {
  const normalizedMessage = normalize(message);
  const normalizedReply = normalize(aiResponse?.reply || '');

  const matchedKeywordGroup = keywordGroups.find((group) => includesAny(normalizedMessage, group.words));

  if (matchedKeywordGroup) {
    return {
      needsHuman: true,
      humanReason: matchedKeywordGroup.reason
    };
  }

  if (Number(aiResponse?.confidence) < 0.65) {
    return {
      needsHuman: true,
      humanReason: 'low_confidence'
    };
  }

  if (aiResponse?.intent === 'unknown') {
    return {
      needsHuman: true,
      humanReason: 'fallback_response'
    };
  }

  if (aiResponse?.escalate_to_human && !knowledgeUsed) {
    return {
      needsHuman: true,
      humanReason: aiResponse.intent === 'human_escalation'
        ? 'human_requested'
        : 'fallback_response'
    };
  }

  if (
    normalizedReply.includes('no tengo ese dato')
    || normalizedReply.includes('do not have that hotel detail')
    || normalizedReply.includes('je n ai pas cette information')
    || normalizedReply.includes('nicht bestatigt')
  ) {
    return {
      needsHuman: true,
      humanReason: 'fallback_response'
    };
  }

  return {
    needsHuman: false,
    humanReason: null
  };
};

export const buildHumanHandoffReply = ({ language = 'es', reason = null }) => {
  if (reason === 'emergency_detected') {
    return {
      es: 'Hemos marcado tu mensaje como urgente. Por favor, contacta también inmediatamente con recepción o emergencias si hay riesgo para tu seguridad. Derivo esto ahora a recepción.',
      en: 'We have marked your message as urgent. Please also contact reception or emergency services immediately if there is any risk to your safety. I am forwarding this to reception now.',
      fr: 'Nous avons marqué votre message comme urgent. Veuillez aussi contacter immédiatement la réception ou les urgences s’il y a un risque pour votre sécurité. Je transmets cela à la réception.',
      de: 'Wir haben Ihre Nachricht als dringend markiert. Bitte kontaktieren Sie sofort auch die Rezeption oder den Notdienst, falls Gefahr besteht. Ich leite dies jetzt an die Rezeption weiter.'
    }[language] || null;
  }

  return {
    es: 'Voy a derivar esto a recepción para ayudarte mejor 😊',
    en: 'I’m forwarding this to reception so we can help you properly 😊',
    fr: 'Je transmets cela à la réception afin de mieux vous aider 😊',
    de: 'Ich leite das an die Rezeption weiter, damit wir Ihnen besser helfen können 😊'
  }[language] || 'Voy a derivar esto a recepción para ayudarte mejor 😊';
};

export const shouldReplaceReplyForHumanEscalation = ({ aiResponse, reason }) => (
  Boolean(reason)
  && reason !== 'emergency_detected'
  && (
    Number(aiResponse?.confidence) < 0.65
    || aiResponse?.intent === 'unknown'
    || aiResponse?.intent === 'human_escalation'
    || reason === 'complaint_detected'
    || reason === 'fallback_response'
    || reason === 'technical_issue_detected'
  )
);
