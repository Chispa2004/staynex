'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, Eye, EyeOff, Languages, MessageSquareText, PauseCircle, PlayCircle, RefreshCw, Search, Send, ShieldCheck, Sparkles, UserRound, Zap, PanelRight } from 'lucide-react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { translateMessageForStaff } from '@/lib/i18n/translateMessageForStaff';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { buildConversationCopilot } from '@/lib/ai-copilot';
import { InboxAiCopilotPanel } from './InboxAiCopilotPanel';
import { PremiumEmptyState } from './PremiumEmptyState';
import ergonomics from './InboxErgonomics.module.css';
import { InboxActionMenu, InboxDetailPanel } from './InboxDetailPanel';
import { shouldCompactOriginalMessage, getVerifiedMessageTranslation } from '@/lib/inbox-message-presentation';
import { cn, ui } from '@/lib/ui/styles';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';
import { MessageAttentionProvider, AttentionToolbar, AttentionMessage } from './MessageAttentionControls';
import { MANUAL_MESSAGE_MAX_LENGTH, manualDeliveryText, normalizeManualDelivery } from '../../shared/manual-send/contract.js';
import { readManualRecovery, blocksSameManualSend, runManualAttempt, getManualSessionStorage, getManualMessageDelivery } from '@/lib/manual-send-client';

const formatDate = (value) => {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
};

const formatTime = (value) => {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const senderStyles = {
  dark: {
    guest: 'border-white/10 bg-[#151b28] text-slate-100 shadow-lg shadow-black/10',
    ai: 'border-emerald-300/20 bg-emerald-300/[0.09] text-emerald-50 shadow-lg shadow-emerald-950/15',
    staff: 'border-sky-300/20 bg-sky-300/[0.10] text-sky-50 shadow-lg shadow-sky-950/15'
  },
  light: {
    guest: 'border-slate-200 bg-white text-slate-900 shadow-sm shadow-slate-200/70',
    ai: 'border-emerald-200 bg-emerald-50 text-slate-900 shadow-sm shadow-emerald-100/70',
    staff: 'border-sky-200 bg-sky-50 text-slate-900 shadow-sm shadow-sky-100/70'
  }
};

const sortConversations = (conversations) => [...conversations].sort(
  (a, b) => new Date(b.last_message_at || b.created_at).getTime() - new Date(a.last_message_at || a.created_at).getTime()
);

const debugInbox = (...args) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(...args);
  }
};

const dedupeMessages = (messages = []) => {
  const seen = new Set();

  return [...messages]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .filter((message) => {
      const key = message.id || `${message.conversation_id}-${message.sender_type}-${message.created_at}-${message.content}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
};

const normalizeInboxConversations = (conversations = []) => {
  const byId = new Map();

  conversations.forEach((conversation) => {
    if (!conversation?.id) {
      return;
    }

    const messages = dedupeMessages(conversation.messages || []);
    const lastMessage = messages[messages.length - 1] || conversation.lastMessage || null;

    const normalizedConversation = {
      ...conversation,
      messages,
      lastMessage,
      last_message_at: conversation.last_message_at || lastMessage?.created_at || conversation.created_at
    };

    byId.set(conversation.id, {
      ...normalizedConversation,
      copilot: conversation.copilot || buildConversationCopilot(normalizedConversation)
    });
  });

  return sortConversations([...byId.values()]);
};

const INBOX_READ_STATE_KEY = 'staynex_inbox_read_state';
const INBOX_UNREAD_TOTAL_KEY = 'staynex_inbox_unread_total';
const INBOX_HUMAN_TOTAL_KEY = 'staynex_inbox_human_total';
const INBOX_TRANSLATION_LANGUAGE_KEY = 'staynex_inbox_translation_language';
export const INBOX_UNREAD_EVENT = 'staynex:inbox-unread-updated';
export const INBOX_HUMAN_EVENT = 'staynex:inbox-human-updated';
const scopedKey = (key, hotelId) => `${key}:${hotelId || 'none'}`;
const TRANSLATION_LANGUAGES = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'it', label: 'IT' },
  { code: 'pt', label: 'PT' }
];

const quickReplyTemplates = [
  { label: 'Late check-out', text: 'Claro, reviso disponibilidad de late check-out para tu estancia.' },
  { label: 'Restaurante', text: 'Puedo ayudarte con recomendaciones de restaurante o una reserva.' },
  { label: 'Traslado', text: 'Puedo ayudarte a organizar un traslado. ¿A qué hora necesitas viajar?' },
  { label: 'Spa', text: 'Reviso opciones y disponibilidad de spa para tu estancia.' },
  { label: 'Escalar', text: 'Voy a pedir a recepción que revise esto personalmente.' },
  { label: 'Traducir', text: '' },
  { label: 'Crear ticket', text: 'Voy a crear un ticket para que el equipo lo revise.' }
];

const AI_MODE = {
  ACTIVE: 'ai_active',
  HUMAN_TAKEOVER: 'human_takeover',
  AI_PAUSED: 'ai_paused',
  ESCALATION_LOCK: 'escalation_lock'
};

const sentimentLabels = {
  angry: 'Molesto',
  frustrated: 'Frustrado',
  negative: 'Negativo',
  positive: 'Positivo',
  happy: 'Contento',
  neutral: 'Neutral'
};

const priorityLabels = {
  low: 'Baja',
  normal: 'Normal',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente'
};

const formatSignalLabel = (value, labels) => labels[String(value || '').toLowerCase()] || String(value || '').replaceAll('_', ' ');

const getConversationAiMode = (conversation) => (
  conversation?.aiState?.state_metadata?.conversation_ai_mode || AI_MODE.ACTIVE
);

const getHumanTakeoverMetadata = (conversation) => (
  conversation?.aiState?.state_metadata?.human_takeover || null
);

const isHumanTakeoverActive = (conversation) => (
  [AI_MODE.HUMAN_TAKEOVER, AI_MODE.AI_PAUSED, AI_MODE.ESCALATION_LOCK].includes(getConversationAiMode(conversation))
);

const normalizeTranslationLanguage = (value) => {
  const language = String(value || '').trim().toLowerCase();
  return TRANSLATION_LANGUAGES.some((item) => item.code === language) ? language : 'es';
};

const readStoredReadState = (hotelId) => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(scopedKey(INBOX_READ_STATE_KEY, hotelId)) || '{}');
  } catch (error) {
    console.error('Inbox read state could not be parsed', error);
    return {};
  }
};

const persistReadState = (nextState, hotelId) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(scopedKey(INBOX_READ_STATE_KEY, hotelId), JSON.stringify(nextState));
};

const readStoredTranslationLanguage = (hotelId) => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(scopedKey(INBOX_TRANSLATION_LANGUAGE_KEY, hotelId)) || null;
};

const persistTranslationLanguage = (language, hotelId) => {
  if (typeof window === 'undefined' || !hotelId) {
    return;
  }

  window.localStorage.setItem(scopedKey(INBOX_TRANSLATION_LANGUAGE_KEY, hotelId), normalizeTranslationLanguage(language));
};

const dispatchUnreadTotal = (total, hotelId) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(scopedKey(INBOX_UNREAD_TOTAL_KEY, hotelId), String(total));
  window.dispatchEvent(new CustomEvent(INBOX_UNREAD_EVENT, {
    detail: { total, hotelId }
  }));
};

const dispatchHumanTotal = (total, hotelId) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(scopedKey(INBOX_HUMAN_TOTAL_KEY, hotelId), String(total));
  window.dispatchEvent(new CustomEvent(INBOX_HUMAN_EVENT, {
    detail: { total, hotelId }
  }));
};

const getMessageTime = (message) => new Date(message.created_at).getTime();

const getUnreadCount = (conversation, readState) => {
  const readAt = readState[conversation.id] ? new Date(readState[conversation.id]).getTime() : 0;

  return (conversation.messages || []).filter((item) => (
    item.sender_type === 'guest' && getMessageTime(item) > readAt
  )).length;
};

const getTotalUnread = (conversations, readState) => conversations.reduce(
  (total, conversation) => total + getUnreadCount(conversation, readState),
  0
);

const humanReasonPatterns = [
  {
    reason: 'emergency_detected',
    pattern: /humo|fuego|incendio|emergencia|emergency|smoke|fire|police|danger|dangerous|accident|peligro|accidente|policia|rauch|feuer|notfall|urgence|fumee/i
  },
  {
    reason: 'complaint_detected',
    pattern: /complaint|angry|upset|unacceptable|terrible|refund|queja|enfadad|muy mal|nadie me ayuda|reembolso|devolucion|reclamation|mecontent|remboursement|beschwerde|verargert/i
  },
  {
    reason: 'technical_issue_detected',
    pattern: /no funciona|broken|not working|averia|kaputt|funktioniert nicht|ne fonctionne pas/i
  }
];

const attentionPattern = new RegExp(
  humanReasonPatterns.map((item) => item.pattern.source).join('|'),
  'i'
);

const getHumanEscalation = (conversation) => {
  if (isHumanTakeoverActive(conversation)) {
    return {
      needsHuman: true,
      reason: 'human_takeover_active'
    };
  }

  const aiLog = conversation.aiLog;

  if (aiLog?.needs_human) {
    return {
      needsHuman: true,
      reason: aiLog.human_reason || 'fallback_response'
    };
  }

  if (Number(aiLog?.confidence_score) < 0.65) {
    return {
      needsHuman: false,
      reason: 'low_confidence'
    };
  }

  if (aiLog?.detected_intent === 'unknown') {
    return {
      needsHuman: false,
      reason: 'fallback_response'
    };
  }

  const messages = conversation.messages || [];
  const matchedReason = humanReasonPatterns.find((item) => messages.some((message) => (
    message.sender_type === 'guest' && item.pattern.test(message.content || '')
  )));

  if (matchedReason) {
    return {
      needsHuman: true,
      reason: matchedReason.reason
    };
  }

  return {
    needsHuman: false,
    reason: null
  };
};

const getNeedsAttention = (conversation, unreadCount) => {
  const messages = conversation.messages || [];
  const lastGuestMessage = [...messages].reverse().find((item) => item.sender_type === 'guest');
  const lastStaffMessage = [...messages].reverse().find((item) => item.sender_type === 'staff');
  const latestGuestNeedsReply = lastGuestMessage
    && (!lastStaffMessage || getMessageTime(lastGuestMessage) > getMessageTime(lastStaffMessage));
  const hasUrgentSignal = messages.some((item) => (
    item.sender_type === 'guest' && attentionPattern.test(item.content || '')
  ));

  return Boolean(hasUrgentSignal || (unreadCount > 0 && latestGuestNeedsReply && conversation.lastMessage?.sender_type === 'guest'));
};

const getHumanTotal = (conversations) => conversations.filter((conversation) => (
  getHumanEscalation(conversation).needsHuman
)).length;

const getIsNewConversation = (conversation, readState) => {
  if (readState[conversation.id]) {
    return false;
  }

  const createdAt = new Date(conversation.created_at || conversation.last_message_at).getTime();
  const dayInMs = 24 * 60 * 60 * 1000;

  return Number.isFinite(createdAt) && Date.now() - createdAt < dayInMs;
};

const updateConversationWithMessage = ({ conversations, conversationId, message }) => sortConversations(
  conversations.map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }

    const currentMessages = conversation.messages || [];

    if (currentMessages.some((item) => item.id === message.id)) {
      return {
        ...conversation,
        last_message_at: message.created_at || conversation.last_message_at,
        lastMessage: message
      };
    }

    const nextConversation = {
      ...conversation,
      last_message_at: message.created_at || conversation.last_message_at,
      lastMessage: message,
      messages: [...currentMessages, message].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    };

    return {
      ...nextConversation,
      copilot: buildConversationCopilot(nextConversation)
    };
  })
);

const updateConversationAiState = ({ conversations, conversationId, aiState }) => sortConversations(
  conversations.map((conversation) => {
    if (conversation.id !== conversationId) {
      return conversation;
    }

    const nextConversation = {
      ...conversation,
      aiState
    };

    return {
      ...nextConversation,
      copilot: buildConversationCopilot(nextConversation)
    };
  })
);

const getConversationMessageCount = (conversations, conversationId) => (
  conversations.find((conversation) => conversation.id === conversationId)?.messages?.length || 0
);

const getConversationGuestLabel = (conversation) => (
  conversation?.guestName
  || conversation?.guest_name
  || conversation?.guest?.name
  || conversation?.guest?.full_name
  || conversation?.reservation?.guest_name
  || conversation?.pmsIntelligenceContext?.reservation?.guestName
  || conversation?.guest?.phone_number
  || conversation?.reservation?.guest_phone
  || 'Huésped'
);

const getConversationRoomNumber = (conversation) => (
  conversation?.roomNumber
  || conversation?.room_number
  || conversation?.guest?.current_room
  || conversation?.reservation?.room_number
  || conversation?.pmsIntelligenceContext?.reservation?.roomNumber
  || conversation?.pmsIntelligenceContext?.guestStayContext?.room_number
  || conversation?.pmsIntelligenceContext?.roomStatus?.roomNumber
  || null
);

const getConversationPhoneNumber = (conversation) => (
  conversation?.phoneNumber
  || conversation?.phone_number
  || conversation?.guest?.phone_number
  || conversation?.reservation?.guest_phone
  || null
);

const getConversationInitials = (conversation) => {
  const label = getConversationGuestLabel(conversation);
  const cleanLabel = String(label || 'Huésped').replace(/[^\p{L}0-9\s+]/gu, ' ').trim();
  const words = cleanLabel.split(/\s+/).filter(Boolean);

  if (!words.length) {
    return 'G';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
};

const getConversationLanguage = (conversation) => (
  conversation?.guest?.preferred_language
  || [...(conversation?.messages || [])].reverse().find((item) => item.sender_type === 'guest')?.original_language
  || conversation?.aiState?.state_metadata?.conversation_language
  || null
);

const isVipConversation = (conversation) => (
  Number(conversation?.guestIntelligence?.profile?.vip_score || 0) >= 70
  || Number(conversation?.pmsIntelligenceContext?.vipScore || 0) >= 70
  || Number(conversation?.copilot?.vipProbability?.probability || 0) >= 0.65
);

const isAngryConversation = (conversation) => (
  ['angry', 'frustrated', 'urgent'].includes(conversation?.copilot?.sentiment?.label)
  || conversation?.aiState?.sentiment === 'negative'
);

const isUrgentConversation = (conversation, unreadCount) => (
  getHumanEscalation(conversation).needsHuman
  || getNeedsAttention(conversation, unreadCount)
  || ['high', 'urgent'].includes(conversation?.copilot?.priority?.level)
  || ['medium', 'high'].includes(conversation?.copilot?.escalationRisk?.level)
);

const getHotelAiReplyAllowed = ({ pilotAiSafety, hotel }) => {
  if (pilotAiSafety?.globalStatus?.allowed === false) {
    return false;
  }

  if (pilotAiSafety?.hotelStatus?.configured) {
    return pilotAiSafety.hotelStatus.enabled === true;
  }

  return hotel?.ai_auto_reply_enabled === true;
};

const getConversationControlBadge = ({ conversation, hotelAiReplyAllowed }) => {
  if (isHumanTakeoverActive(conversation)) {
    return { label: 'Control humano', tone: 'orange', icon: PauseCircle };
  }

  if (!hotelAiReplyAllowed) {
    return { label: 'Respuestas off', tone: 'slate', icon: Bot };
  }

  return { label: 'IA activa', tone: 'emerald', icon: Bot };
};

const getConversationPriorityScore = (conversation, readState) => {
  const unreadCount = getUnreadCount(conversation, readState);
  const recentTime = new Date(conversation.last_message_at || conversation.created_at || 0).getTime();

  return [
    isHumanTakeoverActive(conversation) ? 100000000000000 : 0,
    isUrgentConversation(conversation, unreadCount) ? 10000000000000 : 0,
    unreadCount > 0 ? 1000000000000 : 0,
    isAngryConversation(conversation) ? 100000000000 : 0,
    Number.isFinite(recentTime) ? recentTime : 0
  ].reduce((total, value) => total + value, 0);
};

export const InboxClient = ({ conversations }) => {
  const searchParams = useSearchParams();
  const { language, t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const sortedConversations = useMemo(() => normalizeInboxConversations(conversations), [conversations]);
  const requestedConversationId = searchParams.get('conversationId');
  const [items, setItems] = useState(sortedConversations);
  const [selectedId, setSelectedId] = useState(
    requestedConversationId || null
  );
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(sortedConversations.length === 0);
  const [sending, setSending] = useState(false);
  const [pendingSendKey, setPendingSendKey] = useState(null);
  const [draftOwnerId, setDraftOwnerId] = useState(null);
  const [manualRecoveries, setManualRecoveries] = useState({});
  const [manualReceipts, setManualReceipts] = useState({});
  const [manualHistoryReview, setManualHistoryReview] = useState(null);
  const manualSendLock = useRef(new Set());
  const [takeoverUpdating, setTakeoverUpdating] = useState(false);
  const [hiddenTranslations, setHiddenTranslations] = useState({});
  const [readState, setReadState] = useState({});
  const [readStateLoaded, setReadStateLoaded] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentHotel, setCurrentHotel] = useState(null);
  const [pilotAiSafety, setPilotAiSafety] = useState(null);
  const [staffLanguage, setStaffLanguage] = useState(normalizeTranslationLanguage(language || 'es'));
  const [translationOverrides, setTranslationOverrides] = useState({});
  const [translatingMessages, setTranslatingMessages] = useState({});
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [refreshing, setRefreshing] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [guestPanelOpen, setGuestPanelOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(Boolean(requestedConversationId));
  const [draftsByConversation, setDraftsByConversation] = useState({});
  const locallyClosedConversationIdsRef = useRef(new Set());
  const itemsRef = useRef(sortedConversations);
  const selectedIdRef = useRef(selectedId);
  const messagesScrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const realtimeReloadTimerRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const loadRequestIdRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const pageVisibleRef = useRef(true);
  const staffLanguageRef = useRef(staffLanguage);

  const selectedConversation = items.find((conversation) => conversation.id === selectedId) || null;
  const unreadTotal = useMemo(() => getTotalUnread(items, readState), [items, readState]);
  const humanTotal = useMemo(() => getHumanTotal(items), [items]);
  const selectedHumanEscalation = selectedConversation
    ? getHumanEscalation(selectedConversation)
    : { needsHuman: false, reason: null };
  const selectedAiMode = getConversationAiMode(selectedConversation);
  const selectedHumanTakeoverActive = isHumanTakeoverActive(selectedConversation);
  const selectedTakeoverMetadata = getHumanTakeoverMetadata(selectedConversation);
  const selectedDisplayName = selectedConversation ? getConversationGuestLabel(selectedConversation) : 'Huésped';
  const selectedRoomNumber = getConversationRoomNumber(selectedConversation);
  const selectedPhoneNumber = getConversationPhoneNumber(selectedConversation);
  const draftKey = selectedConversation?.id && currentHotel?.id
    ? `${currentHotel.id}:${selectedConversation.id}`
    : null;
  const recoveryKey = draftOwnerId && draftKey ? `staynex_manual_send:${draftOwnerId}:${draftKey}` : null;
  const selectedRecovery = recoveryKey ? manualRecoveries[recoveryKey] : null;
  const sendingSelectedConversation = sending && pendingSendKey === recoveryKey;
  const manualSendBlocked = blocksSameManualSend(selectedRecovery, message);
  const historyReviewStatus = manualHistoryReview?.key === recoveryKey
    && manualHistoryReview?.attemptId === selectedRecovery?.attemptId ? manualHistoryReview.status : null;

  useEffect(() => {
    if (!recoveryKey) return;
    const receipts = {};
    for (const row of selectedConversation?.messages || []) {
      const key = `${recoveryKey}:${row.id}`;
      const receipt = readManualRecovery(getManualSessionStorage(), key);
      if (receipt) receipts[key] = receipt;
    }
    if (Object.keys(receipts).length) setManualReceipts(current => ({ ...current, ...receipts }));
  }, [recoveryKey, selectedConversation?.messages]);

  useEffect(() => {
    if (!recoveryKey) return;
    const receipt = readManualRecovery(getManualSessionStorage(), recoveryKey);
    if (!receipt) return;
    setManualRecoveries(current => ({ ...current, [recoveryKey]: receipt }));
    if (['unknown', 'failed'].includes(receipt.delivery.status)) {
      setDraftsByConversation(current => current[draftKey] !== undefined ? current : { ...current, [draftKey]: receipt.text });
    }
  }, [recoveryKey, draftKey]);

  useEffect(() => {
    if (!selectedRecovery || selectedRecovery.delivery.status !== 'unknown') return;
    const row = selectedConversation?.messages?.find(item => item.id === selectedRecovery.attemptId);
    const delivery = normalizeManualDelivery(row?.metadata?.manual_send);
    if (delivery.status === 'unknown') return;
    const receipt = { ...selectedRecovery, delivery };
    setManualRecoveries(current => ({ ...current, [recoveryKey]: receipt }));
    try { getManualSessionStorage().setItem(recoveryKey, JSON.stringify(receipt)); } catch { /* Preserve the in-memory result. */ }
    if (['accepted', 'delivered'].includes(delivery.status)) {
      setDraftsByConversation(current => current[draftKey]?.trim() === receipt.text ? { ...current, [draftKey]: '' } : current);
    }
  }, [selectedConversation?.messages, selectedRecovery, recoveryKey, draftKey]);
  const selectedSecondaryLine = [
    selectedRoomNumber ? `Habitación ${selectedRoomNumber}` : null,
    selectedPhoneNumber
  ].filter(Boolean).join(' · ') || t('inbox.noPhone');
  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return items
      .filter((conversation) => {
        const unreadCount = getUnreadCount(conversation, readState);
        const language = getConversationLanguage(conversation);
        const searchable = [
          getConversationGuestLabel(conversation),
          getConversationPhoneNumber(conversation),
          getConversationRoomNumber(conversation),
          conversation.lastMessage?.content,
          conversation.aiState?.current_intent,
          language
        ].filter(Boolean).join(' ').toLowerCase();

        if (query && !searchable.includes(query)) {
          return false;
        }

        if (activeFilter === 'unread') return unreadCount > 0;
        if (activeFilter === 'human') return isHumanTakeoverActive(conversation);
        if (activeFilter === 'urgent') return isUrgentConversation(conversation, unreadCount);
        if (activeFilter === 'vip') return isVipConversation(conversation);
        if (activeFilter === 'ai') return !isHumanTakeoverActive(conversation);

        return true;
      })
      .sort((a, b) => getConversationPriorityScore(b, readState) - getConversationPriorityScore(a, readState));
  }, [activeFilter, items, readState, searchQuery]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    staffLanguageRef.current = staffLanguage;
  }, [staffLanguage]);

  useEffect(() => {
    setMessage(draftKey ? draftsByConversation[draftKey] || '' : '');
  }, [draftKey, draftsByConversation]);

  useEffect(() => {
    if (!currentHotel?.id) {
      setReadState({});
      setReadStateLoaded(false);
      return;
    }

    setReadState(readStoredReadState(currentHotel.id));
    setReadStateLoaded(true);
  }, [currentHotel?.id]);

  useEffect(() => {
    if (
      requestedConversationId
      && !locallyClosedConversationIdsRef.current.has(requestedConversationId)
      && items.some((conversation) => conversation.id === requestedConversationId)
    ) {
      setSelectedId(requestedConversationId);
      setMobileChatOpen(true);
    }
  }, [items, requestedConversationId]);

  useEffect(() => {
    if (readStateLoaded && currentHotel?.id) {
      dispatchUnreadTotal(unreadTotal, currentHotel.id);
    }
  }, [currentHotel?.id, readStateLoaded, unreadTotal]);

  useEffect(() => {
    if (currentHotel?.id) {
      dispatchHumanTotal(humanTotal, currentHotel.id);
    }
  }, [currentHotel?.id, humanTotal]);

  const loadInbox = useCallback(async ({ silent = false, preserveSelection = true, force = false } = {}) => {
    if (loadInFlightRef.current && silent && !force) {
      return null;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    loadInFlightRef.current = true;

    if (!silent) {
      setRefreshing(true);
    }
    if (!silent || itemsRef.current.length === 0) {
      setLoading(true);
    }

    try {
      const response = await fetch('/api/inbox', {
        headers: await getAuthHeaders(),
        cache: 'no-store'
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not refresh inbox');
      }

      if (!shouldAcceptTenantPayload(body, 'inbox')) {
        return null;
      }

      if (!mountedRef.current || requestId !== loadRequestIdRef.current) {
        return null;
      }

      const nextItems = normalizeInboxConversations(body.conversations || []);
      const nextHotelId = body.hotel?.id || null;
      const previousHotelId = currentHotel?.id || null;

      if (previousHotelId && nextHotelId && previousHotelId !== nextHotelId) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('state reset for hotel', { hotelId: nextHotelId, surface: 'inbox' });
        }
        setItems([]);
        setSelectedId(null);
        setReadState({});
        setReadStateLoaded(false);
        setMessage('');
        setDraftsByConversation({});
        locallyClosedConversationIdsRef.current.clear();
        setPilotAiSafety(null);
        setCopilotOpen(false);
        setGuestPanelOpen(false);
        setMobileChatOpen(false);
        setSearchQuery('');
      }

      setCurrentHotel(body.hotel || null);
      setDraftOwnerId(body.actorId || null);
      setPilotAiSafety(body.pilotAiSafety || null);
      setStaffLanguage(normalizeTranslationLanguage(
        readStoredTranslationLanguage(nextHotelId)
        || staffLanguageRef.current
        || body.staffLanguage
        || language
        || 'es'
      ));
      setItems(nextItems);
      setSelectedId((current) => {
        const currentSelection = selectedIdRef.current || current;

        if (currentSelection && locallyClosedConversationIdsRef.current.has(currentSelection)) {
          return null;
        }

        if (preserveSelection && currentSelection && nextItems.some((conversation) => conversation.id === currentSelection)) {
          return currentSelection;
        }

        if (current && nextItems.some((conversation) => conversation.id === current)) {
          return current;
        }

        if (requestedConversationId && !locallyClosedConversationIdsRef.current.has(requestedConversationId)) {
          return requestedConversationId;
        }

        return null;
      });

      return nextItems;
    } catch (error) {
      console.warn('Inbox refresh failed', error);
      return null;
    } finally {
      if (requestId === loadRequestIdRef.current) {
        loadInFlightRef.current = false;
      }

      if (!silent) {
        setRefreshing(false);
      }
      setLoading(false);
    }
  }, [currentHotel?.id, requestedConversationId]);

  useEffect(() => {
    loadInbox({ silent: true });
  }, [loadInbox]);

  useEffect(() => {
    const handleTenantChanged = (event) => {
      const nextHotelId = event.detail?.hotelId || null;
      if (!nextHotelId || nextHotelId === currentHotel?.id) {
        return;
      }

      debugInbox('tenant changed, resetting state', { surface: 'inbox', hotelId: nextHotelId });
      setItems([]);
      setSelectedId(null);
      setMessage('');
      setDraftsByConversation({});
      locallyClosedConversationIdsRef.current.clear();
      setPilotAiSafety(null);
      setReadState({});
      setReadStateLoaded(false);
      setCopilotOpen(false);
      setMobileChatOpen(false);
      setStaffLanguage(normalizeTranslationLanguage(language || 'es'));
      setTranslationOverrides({});
      setTranslatingMessages({});
      setSearchQuery('');
    };

    window.addEventListener('staynex:tenant-changed', handleTenantChanged);

    return () => window.removeEventListener('staynex:tenant-changed', handleTenantChanged);
  }, [currentHotel?.id]);

  const markConversationAsRead = useCallback((conversationId) => {
    if (!conversationId) {
      return;
    }

    setReadState((current) => {
      const nextState = {
        ...current,
        [conversationId]: new Date().toISOString()
      };

      persistReadState(nextState, currentHotel?.id);
      return nextState;
    });
  }, [currentHotel?.id]);

  const isMessagesPanelNearBottom = useCallback(() => {
    const element = messagesScrollRef.current;

    if (!element) {
      return true;
    }

    return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }, []);

  const scrollMessagesToBottom = useCallback((behavior = 'smooth') => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior });
    });
  }, []);

  const refreshInboxSilently = useCallback(async ({ reason = 'silent' } = {}) => {
    const selectedBeforeReload = selectedIdRef.current;
    const messagesBefore = selectedBeforeReload
      ? getConversationMessageCount(itemsRef.current, selectedBeforeReload)
      : 0;
    const wasNearBottom = isMessagesPanelNearBottom();

    debugInbox('Inbox refresh requested', { reason });

    const nextItems = await loadInbox({
      preserveSelection: true,
      silent: true
    });

    if (!nextItems) {
      return;
    }

    debugInbox('Inbox refreshed silently', { reason });

    if (!selectedBeforeReload) {
      return nextItems;
    }

    const messagesAfter = getConversationMessageCount(nextItems, selectedBeforeReload);
    const hasNewActiveMessages = messagesAfter > messagesBefore;

    if (hasNewActiveMessages) {
      markConversationAsRead(selectedBeforeReload);
    }

    if (wasNearBottom && hasNewActiveMessages) {
      scrollMessagesToBottom('smooth');
    }
    return nextItems;
  }, [isMessagesPanelNearBottom, loadInbox, markConversationAsRead, scrollMessagesToBottom]);

  const reviewManualHistory = async () => {
    if (!selectedRecovery || historyReviewStatus === 'loading') return;
    const review = { key: recoveryKey, attemptId: selectedRecovery.attemptId };
    setManualHistoryReview({ ...review, status: 'loading' });
    try {
      const items = await refreshInboxSilently({ reason: 'manual_send_review' });
      setManualHistoryReview({ ...review, status: items ? 'updated' : 'error' });
    } catch {
      setManualHistoryReview({ ...review, status: 'error' });
    }
  };

  const scheduleRealtimeReload = useCallback((reason) => {
    if (realtimeReloadTimerRef.current) {
      window.clearTimeout(realtimeReloadTimerRef.current);
    }

    realtimeReloadTimerRef.current = window.setTimeout(async () => {
      realtimeReloadTimerRef.current = null;
      await refreshInboxSilently({ reason });

      debugInbox('Inbox realtime reload completed', { reason });
    }, 500);
  }, [refreshInboxSilently]);

  useEffect(() => {
    if (readStateLoaded && selectedId) {
      markConversationAsRead(selectedId);
    }
  }, [markConversationAsRead, readStateLoaded, selectedId]);

  useEffect(() => {
    scrollMessagesToBottom('auto');
  }, [scrollMessagesToBottom, selectedConversation?.id]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const activeHotelId = currentHotel?.id || null;

    if (!supabase) {
      console.warn('Inbox Realtime unavailable: missing Supabase browser client');
      setRealtimeStatus('fallback');
      return undefined;
    }

    if (!activeHotelId) {
      console.warn('Inbox Realtime unavailable: active hotel is required');
      setRealtimeStatus('fallback');
      return undefined;
    }

    const channel = supabase
      .channel(`dashboard-inbox-${activeHotelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `hotel_id=eq.${activeHotelId}`
        },
        (payload) => {
          const payloadHotelId = payload?.new?.hotel_id || null;

          if (payloadHotelId !== activeHotelId) {
            console.warn('Inbox Realtime ignored message outside active hotel', {
              expectedHotelId: activeHotelId,
              receivedHotelId: payloadHotelId || 'missing'
            });
            return;
          }

          debugInbox('Message INSERT received', payload.new);
          scheduleRealtimeReload('message_insert');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `hotel_id=eq.${activeHotelId}`
        },
        (payload) => {
          debugInbox('Conversation UPDATE received', payload.new);
          scheduleRealtimeReload('conversation_update');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `hotel_id=eq.${activeHotelId}`
        },
        (payload) => {
          debugInbox('Conversation INSERT received', payload.new);
          scheduleRealtimeReload('conversation_insert');
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_offers',
          filter: `hotel_id=eq.${activeHotelId}`
        },
        (payload) => {
          debugInbox('AI Offer change received', payload.new || payload.old);
          scheduleRealtimeReload('ai_offer_change');
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_ai_state',
          filter: `hotel_id=eq.${activeHotelId}`
        },
        (payload) => {
          debugInbox('AI Conversation State change received', payload.new || payload.old);
          scheduleRealtimeReload('conversation_ai_state_change');
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'experience_booking_requests',
          filter: `hotel_id=eq.${activeHotelId}`
        },
        (payload) => {
          debugInbox('Experience booking request change received', payload.new || payload.old);
          scheduleRealtimeReload('experience_booking_request_change');
        }
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          debugInbox('Realtime connected');
          setRealtimeStatus('connected');
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Inbox Realtime error', {
            status,
            error
          });
          setRealtimeStatus('fallback');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentHotel?.id, scheduleRealtimeReload]);

  useEffect(() => () => {
    if (realtimeReloadTimerRef.current) {
      window.clearTimeout(realtimeReloadTimerRef.current);
      realtimeReloadTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (pollingIntervalRef.current) {
      window.clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = window.setInterval(() => {
      if (!pageVisibleRef.current) {
        return;
      }

      refreshInboxSilently({ reason: 'polling' });
    }, 5000);

    return () => {
      if (pollingIntervalRef.current) {
        window.clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [refreshInboxSilently]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      pageVisibleRef.current = document.visibilityState !== 'hidden';

      if (pageVisibleRef.current) {
        refreshInboxSilently({ reason: 'visibility_resume' });
      }
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshInboxSilently]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (manualSendLock.current.size || sending || !selectedConversation || !message.trim() || !recoveryKey
      || message.trim().length > MANUAL_MESSAGE_MAX_LENGTH
      || blocksSameManualSend(selectedRecovery || readManualRecovery(getManualSessionStorage(), recoveryKey), message)) {
      return;
    }
    const messageToSend = message.trim();
    const conversationId = selectedConversation.id;
    const hotelId = currentHotel.id;
    const attemptId = crypto.randomUUID();
    const capturedDraftKey = draftKey;
    try {
      await runManualAttempt({
        lock: manualSendLock.current, key: recoveryKey, text: messageToSend, attemptId,
        persist: receipt => getManualSessionStorage().setItem(recoveryKey, JSON.stringify(receipt)),
        onPending: () => { setPendingSendKey(recoveryKey); setSending(true); },
        request: async () => {
          const response = await fetch('/api/messages/send', {
            method: 'POST', signal: AbortSignal.timeout(30000),
            headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, message: messageToSend, staffLanguage, attemptId })
          });
          return response.json();
        },
        onResult: (receipt, row) => {
          setManualRecoveries(current => ({ ...current, [recoveryKey]: receipt }));
          const receiptKey = `${recoveryKey}:${attemptId}`;
          setManualReceipts(current => ({ ...current, [receiptKey]: receipt }));
          try { getManualSessionStorage().setItem(receiptKey, JSON.stringify(receipt)); } catch { /* Preserve the in-memory receipt. */ }
          if (row?.hotel_id === hotelId && row.conversation_id === conversationId && row.id === attemptId) {
            setItems(current => updateConversationWithMessage({ conversations: current, conversationId, message: row }));
          }
          if (['accepted', 'delivered'].includes(receipt.delivery.status)) {
            setDraftsByConversation(current => current[capturedDraftKey]?.trim() === messageToSend ? { ...current, [capturedDraftKey]: '' } : current);
            if (selectedIdRef.current === conversationId) markConversationAsRead(conversationId);
          }
          if (selectedIdRef.current === conversationId) scrollMessagesToBottom('smooth');
        }
      });
    } finally {
      setSending(false);
      setPendingSendKey(null);
    }
  };

  const updateHumanTakeover = async (action) => {
    if (!selectedConversation?.id || takeoverUpdating) {
      return;
    }

    setTakeoverUpdating(true);

    try {
      const response = await fetch('/api/inbox/takeover', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          action
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update AI control mode');
      }

      if (body.aiState) {
        setItems((current) => updateConversationAiState({
          conversations: current,
          conversationId: selectedConversation.id,
          aiState: body.aiState
        }));
      }

      await refreshInboxSilently({ reason: `human_takeover_${action}` });
    } catch (error) {
      console.error('Human takeover update failed', error);
    } finally {
      setTakeoverUpdating(false);
    }
  };

  const updateOfferAction = async ({ offerId, action }) => {
    try {
      const response = await fetch('/api/ai-offers', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ offerId, action })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not update AI offer');
      }

      await refreshInboxSilently({ reason: `offer_${action}` });
    } catch (error) {
      console.error('AI offer action failed', error);
    }
  };

  const requestMessageTranslation = useCallback(async (item, targetLanguage) => {
    if (!item?.id || !item.content?.trim()) {
      return null;
    }

    const normalizedTarget = normalizeTranslationLanguage(targetLanguage);
    const sourceLanguage = item.original_language || translateMessageForStaff({
      message: item.content,
      targetLanguage: normalizedTarget
    }).sourceLanguage;

    if (shouldCompactOriginalMessage({ sourceLanguage: item.original_language, readingLanguage: normalizedTarget })) {
      return null;
    }

    const key = `${item.id}:${normalizedTarget}`;

    if (translationOverrides[key] || translatingMessages[key]) {
      return translationOverrides[key] || null;
    }

    setTranslatingMessages((current) => ({
      ...current,
      [key]: true
    }));

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messageId: item.id,
          text: item.content,
          sourceLanguage,
          targetLanguage: normalizedTarget
        })
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not translate message');
      }
      if (body.cache_scope !== 'hotel-v1' || body.hotelId !== currentHotel?.id
        || body.messageId !== item.id || body.targetLanguage !== normalizedTarget) {
        throw new Error('Translation provenance could not be verified');
      }

      const nextTranslation = {
        translation: body.translatedText,
        sourceLanguage: body.sourceLanguage || sourceLanguage,
        targetLanguage: body.targetLanguage || normalizedTarget,
        provider: body.provider || null
      };

      setTranslationOverrides((current) => ({
        ...current,
        [key]: nextTranslation
      }));

      setItems((current) => current.map((conversation) => ({
        ...conversation,
        messages: (conversation.messages || []).map((messageItem) => (
          messageItem.id === item.id
            ? {
              ...messageItem,
              original_language: nextTranslation.sourceLanguage || messageItem.original_language,
              translated_language: nextTranslation.targetLanguage,
              translated_text: nextTranslation.translation || messageItem.translated_text,
              translation_provider: nextTranslation.provider || messageItem.translation_provider,
              metadata: body.metadata || {
                ...(messageItem.metadata || {}),
                translations: {
                  ...(messageItem.metadata?.translations || {}),
                  [normalizedTarget]: {
                    translated_text: nextTranslation.translation,
                    source_language: nextTranslation.sourceLanguage,
                    target_language: nextTranslation.targetLanguage,
                    provider: nextTranslation.provider
                  }
                }
              }
            }
            : messageItem
        ))
      })));

      return nextTranslation;
    } catch (error) {
      console.warn('Message translation failed', error);
      return null;
    } finally {
      setTranslatingMessages((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, [translatingMessages, translationOverrides, currentHotel?.id]);

  // Translation is requested by the message action, never by opening a chat
  // or changing reading language. Historical entries must not trigger a backfill.

  const handleTranslationLanguageChange = async (event) => {
    const nextLanguage = normalizeTranslationLanguage(event.target.value);

    setStaffLanguage(nextLanguage);
    persistTranslationLanguage(nextLanguage, currentHotel?.id);
    setHiddenTranslations({});

    if (process.env.NODE_ENV !== 'production') {
      console.info('inbox_translation_language_changed', {
        hotelId: currentHotel?.id || null,
        language: nextLanguage
      });
    }

    try {
      await fetch('/api/translate', {
        method: 'PATCH',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          preferredTranslationLanguage: nextLanguage
        })
      });
    } catch (error) {
      console.warn('Could not persist translation language preference', error);
    }
  };

  const toggleTranslation = (messageId) => {
    setHiddenTranslations((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }));
  };

  const updateComposerDraft = useCallback((nextValue) => {
    setMessage(nextValue);
    // A new edit after a confirmed acceptance starts a new composition. Keeping
    // the receipt until this gesture also closes the fast double-click window.
    if (recoveryKey && ['accepted', 'delivered'].includes(selectedRecovery?.delivery.status)) {
      setManualRecoveries(current => { const next = { ...current }; delete next[recoveryKey]; return next; });
      try { getManualSessionStorage().removeItem(recoveryKey); } catch { /* Existing receipt remains conservative. */ }
    }

    if (!draftKey) {
      return;
    }

    setDraftsByConversation((current) => ({
      ...current,
      [draftKey]: nextValue
    }));
  }, [draftKey, recoveryKey, selectedRecovery?.delivery.status]);

  const clearComposerDraft = useCallback(() => {
    setMessage('');

    if (!draftKey) {
      return;
    }

    setDraftsByConversation((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  }, [draftKey]);

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const closeActiveConversation = useCallback(() => {
    if (selectedIdRef.current) {
      locallyClosedConversationIdsRef.current.add(selectedIdRef.current);
    }

    setSelectedId(null);
    setMobileChatOpen(false);
    setCopilotOpen(false);
    setGuestPanelOpen(false);
  }, []);

  if (items.length === 0) {
    return (
      <section className={ergonomics.inbox}>
        <div className={cn(
          'premium-fade-in flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 lg:rounded-xl lg:border',
          isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#0b1019]'
        )}>
          <div className={cn(`${ergonomics.listHeader} shrink-0 border-b px-4 py-4 sm:px-6`, isLight ? 'border-slate-200 bg-white' : 'border-white/10')}>
            <p className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Inbox</p>
            <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-500'}>
              {loading ? 'Cargando conversaciones' : t('inbox.noConversations')}
            </p>
          </div>
          {loading ? (
            <div className="executive-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className={cn('h-20 rounded-lg', ui.skeleton(isLight))} />
              ))}
            </div>
          ) : (
            <PremiumEmptyState
              icon={Bot}
              title={t('inbox.noConversations')}
              description={t('inbox.noConversationsDescription')}
              className="m-4"
            />
          )}
        </div>
      </section>
    );
  }

  const copilotSignals = [
    selectedHumanEscalation.needsHuman,
    ['high', 'urgent'].includes(selectedConversation?.copilot?.priority?.level),
    ['medium', 'high'].includes(selectedConversation?.copilot?.escalationRisk?.level),
    selectedConversation?.copilot?.revenueOpportunity?.source && selectedConversation.copilot.revenueOpportunity.source !== 'none',
    (selectedConversation?.offers || []).length > 0,
    (selectedConversation?.upsells || []).length > 0,
    (selectedConversation?.experienceBookings || []).length > 0,
    selectedConversation?.aiState?.escalation_level && selectedConversation.aiState.escalation_level !== 'ai_handled'
  ].filter(Boolean).length;
  const chatOpen = Boolean(selectedConversation && mobileChatOpen);
  const selectedGuestLanguage = selectedConversation?.guest?.preferred_language
    || [...(selectedConversation?.messages || [])].reverse().find((item) => item.sender_type === 'guest')?.original_language
    || null;
  const replyWillTranslate = Boolean(selectedGuestLanguage && selectedGuestLanguage !== staffLanguage);
  const humanTakeoverTotal = items.filter((conversation) => isHumanTakeoverActive(conversation)).length;
  const hotelAiReplyAllowed = getHotelAiReplyAllowed({ pilotAiSafety, hotel: currentHotel });
  const selectedControlBadge = selectedConversation
    ? getConversationControlBadge({ conversation: selectedConversation, hotelAiReplyAllowed })
    : null;
  const filterItems = [
    { key: 'all', label: 'Todas', count: items.length },
    { key: 'unread', label: 'Sin leer', count: items.reduce((total, conversation) => total + (getUnreadCount(conversation, readState) > 0 ? 1 : 0), 0) },
    { key: 'human', label: 'Control humano', count: humanTakeoverTotal },
    { key: 'urgent', label: 'Urgentes', count: items.filter((conversation) => isUrgentConversation(conversation, getUnreadCount(conversation, readState))).length },
    { key: 'vip', label: 'VIP', count: items.filter((conversation) => isVipConversation(conversation)).length },
    { key: 'ai', label: hotelAiReplyAllowed ? 'IA activa' : 'IA sin control humano', count: items.filter((conversation) => !isHumanTakeoverActive(conversation)).length }
  ];
  return (
    <MessageAttentionProvider key={`${currentHotel?.id || ''}:${selectedConversation?.id || ''}`} hotelId={currentHotel?.id} conversation={selectedConversation}>
    <section className={ergonomics.inbox}>
      <div
        data-detail-open={Boolean(selectedConversation && (copilotOpen || guestPanelOpen))}
        className={[
          'premium-fade-in relative grid h-full min-h-0 overflow-hidden rounded-none border-0 shadow-none backdrop-blur lg:rounded-xl lg:border',
          ergonomics.workspace,
          isLight
            ? 'border-slate-200 bg-white'
            : 'border-white/10 bg-[#0b1019]'
        ].join(' ')}
      >
      <aside className={[
        ergonomics.list,
        chatOpen ? 'hidden lg:flex' : 'flex',
        'min-h-0 flex-col lg:border-r',
        isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/10'
      ].join(' ')}
      >
        <div className={[
          `${ergonomics.listHeader} shrink-0 border-b px-4 py-4 sm:px-6`,
          isLight ? 'border-slate-200 bg-white' : 'border-white/10'
        ].join(' ')}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={isLight ? 'text-lg font-semibold text-slate-950' : 'text-lg font-semibold text-white'}>Inbox</p>

            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={[
                  'inline-flex rounded-full border px-2 py-1 text-xs font-medium',
                  realtimeStatus === 'connected'
                    ? isLight
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                    : isLight
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-amber-300/20 bg-amber-300/10 text-amber-100'
                ].join(' ')}
              >
                {realtimeStatus === 'connected' ? 'En vivo' : 'Actualización manual'}
              </span>
              <button
                type="button"
                onClick={() => loadInbox()}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
                  isLight
                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
                )}
                title={t('buttons.refresh')}
              >
                <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" />
                <span className="sr-only">{t('buttons.refresh')}</span>
              </button>
            </div>
          </div>
              <p className={isLight ? 'mt-1 text-sm text-slate-600' : 'mt-1 text-sm text-slate-500'}>
                {items.length} conversaciones
                {unreadTotal > 0 ? ` · ${unreadTotal} mensajes sin leer` : ''}
                {humanTakeoverTotal > 0 ? ` · ${humanTakeoverTotal} en control humano` : ''}
              </p>
          <div className={cn(
            'mt-3 flex items-center gap-2 rounded-lg border px-3 py-2',
            isLight ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-white/10 bg-black/15 text-slate-200'
          )}
          >
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Buscar huésped, habitación, mensaje o idioma"
              placeholder="Buscar huésped, habitación, mensaje…"
              className={cn(
                'min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400',
                isLight ? 'text-slate-900' : 'text-white'
              )}
            />
          </div>
        </div>

        <div className={[
          `${ergonomics.filters} flex shrink-0 flex-wrap gap-2 border-b p-3 sm:px-4`,
          isLight ? 'border-slate-200 bg-white/80' : 'border-white/10 bg-black/10'
        ].join(' ')}
        >
          {filterItems.map((filter) => {
            const active = activeFilter === filter.key;

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                aria-label={`${filter.label}: ${filter.count} conversaciones`}
                aria-pressed={active}
                className={[
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition',
                  isLight
                    ? active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    : active
                      ? 'border-orange-300/25 bg-orange-400/10 text-orange-100'
                      : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
                ].join(' ')}
              >
                {filter.label}
                {filter.count > 0 ? (
                  <span className={active ? 'rounded-full bg-emerald-200 px-1.5 py-0.5 text-[10px] font-black text-slate-950' : 'rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-700'}>
                    {filter.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          className={`executive-scroll min-h-0 flex-1 overflow-y-auto ${ergonomics.conversationList}`}
          data-inbox-scroll-region="conversation-list"
        >
          {visibleItems.length === 0 ? (
            <PremiumEmptyState
              icon={AlertTriangle}
              title="No hay conversaciones en esta vista"
              description="Prueba otro filtro o cambia la búsqueda."
              className="min-h-32 px-4 py-8"
            />
          ) : null}
          {visibleItems.map((conversation) => {
            const active = conversation.id === selectedId;
            const lastMessage = conversation.lastMessage;
            const unreadCount = getUnreadCount(conversation, readState);
            const unread = unreadCount > 0;
            const humanEscalation = getHumanEscalation(conversation);
            const needsAttention = humanEscalation.needsHuman || getNeedsAttention(conversation, unreadCount);
            const hasUpsell = (conversation.upsells || []).length > 0;
            const hasOffer = (conversation.offers || []).length > 0;
            const hasExperienceBooking = (conversation.experienceBookings || []).length > 0;
            const displayName = getConversationGuestLabel(conversation);
            const roomNumber = getConversationRoomNumber(conversation);
            const priority = conversation.copilot?.priority?.level || (needsAttention ? 'high' : 'normal');
            const vip = isVipConversation(conversation);
            const controlBadge = getConversationControlBadge({
              conversation,
              hotelAiReplyAllowed
            });
            const badgeItems = [
              controlBadge,
              needsAttention ? { label: 'Atención humana', tone: 'red', icon: AlertTriangle } : null,
              vip ? { label: 'VIP', tone: 'violet' } : null,
              hasExperienceBooking ? { label: 'Experiencia', tone: 'amber' } : null,
              hasOffer || hasUpsell ? { label: 'Revenue', tone: 'emerald' } : null
            ].filter(Boolean).slice(0, needsAttention ? 5 : 4);

            return (
              <button
                key={conversation.id}
                aria-current={active ? 'true' : undefined}
                type="button"
                onClick={() => {
                  locallyClosedConversationIdsRef.current.delete(conversation.id);
                  setSelectedId(conversation.id);
                  markConversationAsRead(conversation.id);
                  setMobileChatOpen(true);
                }}
                className={cn(
                  ergonomics.conversationRow,
                  'relative block w-full border px-4 py-3 text-left transition duration-150',
                  isLight
                    ? active
                      ? 'border-emerald-200 bg-white shadow-sm ring-1 ring-emerald-100'
                      : needsAttention
                        ? 'border-amber-200 bg-white shadow-sm'
                        : unread
                          ? 'border-slate-200 bg-white shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    : active
                      ? 'border-emerald-300/25 bg-white/[0.055] shadow-lg shadow-black/10'
                      : needsAttention
                        ? 'border-amber-300/25 bg-white/[0.035] shadow-lg shadow-black/10'
                        : unread
                          ? 'border-white/10 bg-white/[0.035] shadow-lg shadow-black/10'
                          : 'border-white/10 bg-white/[0.025] hover:bg-white/[0.045]'
                )}
              >
                {(active || needsAttention || unread) ? (
                  <span
                    className={cn(
                      'absolute bottom-3 left-0 top-3 w-1 rounded-r-full',
                      needsAttention ? 'bg-amber-400' : active ? 'bg-emerald-400' : 'bg-sky-400'
                    )}
                    aria-hidden="true"
                  />
                ) : null}
                <div className="flex items-start gap-3">
                  <span className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold shadow-sm',
                    isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-white/10 bg-white/[0.06] text-slate-200'
                  )}
                  >
                    {getConversationInitials(conversation)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          {unread ? (
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-300 shadow-lg shadow-emerald-400/60" />
                          ) : null}
                          <p className={isLight ? `truncate text-sm ${unread ? 'font-bold text-slate-950' : 'font-semibold text-slate-900'}` : `truncate text-sm ${unread ? 'font-bold text-white' : 'font-semibold text-slate-100'}`}>
                            {displayName}
                          </p>
                        </div>
                        <p className={isLight ? 'mt-0.5 text-xs text-slate-500' : 'mt-0.5 text-xs text-slate-500'}>
                          {roomNumber ? `Habitación ${roomNumber}` : 'Sin habitación asignada'}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={isLight ? 'text-xs font-medium text-slate-500' : 'text-xs font-medium text-slate-500'}>
                          {formatTime(conversation.last_message_at || conversation.created_at)}
                        </span>
                        {unread ? (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-1.5 text-[10px] font-black text-slate-950 shadow-lg shadow-emerald-500/20">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className={isLight ? `mt-2 line-clamp-2 text-sm ${unread ? 'font-semibold text-slate-800' : 'text-slate-600'}` : `mt-2 line-clamp-2 text-sm ${unread ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>
                      {lastMessage?.content || t('inbox.noMessages')}
                    </p>
                    <div className={ergonomics.listBadges}>
                      {badgeItems.map((badge) => {
                        const Icon = badge.icon;
                        return (
                          <span key={badge.label} className={ui.badge(isLight, badge.tone, true)}>
                            {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
                            {badge.label}
                          </span>
                        );
                      })}
                      {priority === 'urgent' ? (
                        <span className={ui.badge(isLight, priority === 'urgent' || priority === 'high' ? 'amber' : 'slate', true)}>
                          {formatSignalLabel(priority, priorityLabels)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={[
        selectedConversation ? chatOpen ? 'flex' : 'hidden lg:flex' : 'hidden',
        `${ergonomics.chat} h-full min-h-0 flex-col overflow-hidden`
      ].join(' ')}
      >
        <header className={[
              `${ergonomics.header} shrink-0 border-b px-3 py-3 sm:px-5 sm:py-4`,
              isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/[0.035]'
        ].join(' ')}
        >
          <div className={ergonomics.chatHeader}>
            <div className={ergonomics.identityRow}>
            <div className={ergonomics.identity}>
              <button
                type="button"
                onClick={closeActiveConversation}
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition',
                  isLight
                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                )}
                aria-label="Volver a conversaciones"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className={isLight ? 'break-words text-sm font-semibold text-slate-900' : 'break-words text-sm font-semibold text-white'}>
                  {selectedDisplayName}
                </p>
                <p className={isLight ? 'break-words text-sm text-slate-600' : 'break-words text-sm text-slate-500'}>
                  {selectedSecondaryLine}
                </p>
              </div>
            </div>
            <div className={ergonomics.effectiveState}>
              {!selectedHumanTakeoverActive ? <span className={[
                'w-fit rounded-full border px-3 py-1 text-xs font-semibold capitalize',
                selectedHumanEscalation.needsHuman
                  ? isLight
                    ? 'border-orange-200 bg-orange-50 text-orange-800'
                    : 'border-orange-300/20 bg-orange-400/10 text-orange-100'
                  : isLight
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
              ].join(' ')}
              >
                {selectedHumanEscalation.needsHuman
                  ? t('inbox.needsHuman')
                  : t(`status.${selectedConversation?.status || 'unknown'}`)}
              </span> : null}
              <span className={[
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                selectedHumanTakeoverActive
                  ? isLight
                    ? 'border-orange-200 bg-orange-50 text-orange-800'
                    : 'border-orange-300/20 bg-orange-400/10 text-orange-100'
                  : selectedControlBadge?.tone === 'slate'
                    ? isLight
                      ? 'border-slate-200 bg-slate-50 text-slate-700'
                      : 'border-white/10 bg-white/[0.045] text-slate-300'
                  : isLight
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
              ].join(' ')}
              >
                {selectedHumanTakeoverActive ? (
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {selectedHumanTakeoverActive ? 'Recepción al mando · IA en pausa' : selectedControlBadge?.label || 'IA'}
              </span>
              <AttentionToolbar />
            </div>
            </div>
            <div className={ergonomics.secondaryControls}>
              <button type="button" title="Ficha del huésped" className={ergonomics.detailToggle} onClick={() => { setGuestPanelOpen(open => !open); setCopilotOpen(false); }} aria-expanded={guestPanelOpen} aria-controls="inbox-detail-panel"><PanelRight size={18} aria-hidden="true" /><span className="sr-only">Ficha del huésped</span></button>
              <button
                type="button"
                onClick={() => updateHumanTakeover(selectedHumanTakeoverActive ? 'resume' : 'takeover')}
                disabled={takeoverUpdating || !selectedConversation?.id}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
                  selectedHumanTakeoverActive
                    ? isLight
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15'
                    : isLight
                      ? 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100'
                      : 'border-orange-300/20 bg-orange-400/10 text-orange-100 hover:bg-orange-400/15'
                )}
              >
                {selectedHumanTakeoverActive ? (
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <PauseCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {selectedHumanTakeoverActive ? 'Devolver a IA' : 'Tomar control'}
              </button>
              <button
                type="button"
                onClick={() => loadInbox()}
                className={[
                  'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
                  isLight
                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                ].join(' ')}
                title={t('buttons.refresh')}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className={[
          `${ergonomics.history} executive-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4`,
          isLight ? 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_32%),#f8fafc]' : 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_35%),#080c14]/70'
        ].join(' ')}
        ref={messagesScrollRef}
        data-inbox-scroll-region="message-history"
        >
          {(selectedConversation?.messages || []).map((item) => {
            const isStaff = item.sender_type === 'staff';
            const messageDelivery = getManualMessageDelivery(item, manualReceipts[`${recoveryKey}:${item.id}`] || selectedRecovery);
            const translationKey = `${item.id}:${staffLanguage}`;
            const metadataTranslation = getVerifiedMessageTranslation(item, staffLanguage, currentHotel?.id);
            const messageTranslation = translationOverrides[translationKey] || metadataTranslation
              || { translation: null, sourceLanguage: item.original_language || null, targetLanguage: staffLanguage };
            const hasTranslation = Boolean(messageTranslation.translation);
            const isTranslating = Boolean(translatingMessages[translationKey]);
            const translationVisible = hasTranslation && !hiddenTranslations[item.id];
            const languageBadge = item.original_language || messageTranslation.sourceLanguage || null;
            const translationLabel = isStaff ? t('inbox.guestTranslation') : t('inbox.staffTranslation');
            const compactOriginal = shouldCompactOriginalMessage({
              sourceLanguage: item.original_language,
              readingLanguage: staffLanguage,
              hasTranslation,
              isTranslating
            });
            const isAi = item.sender_type === 'ai';

            return (
              <div
                key={item.id}
                className={[
                  `${ergonomics.messageRow} flex items-end gap-2`,
                  isStaff || isAi ? 'justify-end' : 'justify-start'
                ].join(' ')}
              >
                <article className={[
                  `${ergonomics.bubble} max-w-[min(90%,760px)] rounded-2xl border px-3 py-3 transition duration-200 sm:max-w-[min(82%,760px)] sm:px-4 sm:py-3.5`,
                  isStaff ? 'rounded-br-md' : 'rounded-bl-md',
                  senderStyles[theme][item.sender_type] || senderStyles[theme].guest
                ].join(' ')}
                >
                  <div className={ergonomics.messageMeta}>
                    <p className={[
                      'flex items-center gap-2 text-xs font-semibold',
                      isLight
                        ? item.sender_type === 'staff'
                          ? 'text-sky-800'
                          : item.sender_type === 'ai'
                            ? 'text-emerald-800'
                            : 'text-slate-700'
                        : ''
                    ].join(' ')}
                    >
                      {item.sender_type === 'guest'
                        ? t('inbox.guest')
                        : item.sender_type === 'staff'
                          ? t('inbox.staff')
                          : 'Staynex'}
                      {isAi ? (
                        <span className={ui.badge(isLight, 'emerald', true)}>
                          IA
                        </span>
                      ) : null}
                      {languageBadge ? (
                        <span className={isLight ? 'rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500' : 'rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] font-bold text-slate-300'}>
                          {String(languageBadge).toUpperCase()}
                        </span>
                      ) : null}
                    </p>
                    <p className={isLight ? 'inline-flex items-center gap-1 text-xs text-slate-500' : 'inline-flex items-center gap-1 text-xs opacity-60'}>
                      {formatTime(item.created_at)}
                      {isStaff && messageDelivery?.status === 'delivered' ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {isStaff ? (
                      <div className="text-xs" role="status">
                        {messageDelivery ? manualDeliveryText(messageDelivery) : 'Estado de envío no disponible para este mensaje histórico.'}
                        {['unknown', 'failed'].includes(messageDelivery?.status) ? (
                          <button type="button" className="ml-2 underline" disabled={sending} onClick={() => {
                            if (!recoveryKey) return;
                            const receipt = { text: item.content, attemptId: item.id, delivery: messageDelivery };
                            updateComposerDraft(item.content);
                            setManualRecoveries(current => ({ ...current, [recoveryKey]: receipt }));
                            try { getManualSessionStorage().setItem(recoveryKey, JSON.stringify(receipt)); } catch { /* No send is dispatched here. */ }
                          }}>Recuperar texto</button>
                        ) : null}
                      </div>
                    ) : null}
                    <div>
                      {hasTranslation ? <p className={isLight ? 'mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500' : 'mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-55'}>
                        {t('inbox.original')}
                      </p> : null}
                      <p className={ergonomics.messageText}>{item.content}</p>
                      <AttentionMessage message={item} />
                    </div>

                    {hasTranslation ? (
                      <div className={isLight ? 'border-t border-slate-200 pt-3' : 'border-t border-white/10 pt-3'}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className={isLight ? 'text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500' : 'text-[10px] font-semibold uppercase tracking-[0.16em] opacity-60'}>
                            {translationLabel}
                            {messageTranslation.targetLanguage ? ` - ${String(messageTranslation.targetLanguage).toUpperCase()}` : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleTranslation(item.id)}
                            className={[
                              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition',
                              isLight
                                ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                : 'border-white/10 bg-black/15 opacity-80 hover:bg-white/10 hover:opacity-100'
                            ].join(' ')}
                          >
                            {translationVisible ? (
                              <EyeOff className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Eye className="h-3 w-3" aria-hidden="true" />
                            )}
                            {translationVisible ? t('inbox.hideTranslation') : t('inbox.showTranslation')}
                          </button>
                        </div>
                        {translationVisible ? (
                          <p className={[
                            'whitespace-pre-wrap rounded-lg border px-3 py-2 text-sm leading-6',
                            isLight
                              ? 'border-slate-200 bg-white text-slate-900'
                              : 'border-white/10 bg-black/20'
                          ].join(' ')}
                          >
                            {messageTranslation.translation}
                          </p>
                        ) : null}
                      </div>
                    ) : isTranslating ? (
                      <p className={isLight ? 'border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500' : 'border-t border-white/10 pt-3 text-xs font-semibold text-slate-500'}>
                        {t('inbox.translating')}
                      </p>
                    ) : !compactOriginal && item.content?.trim() ? (
                      <button
                        type="button"
                        onClick={() => requestMessageTranslation(item, staffLanguage)}
                        className={isLight ? 'inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100' : 'inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10'}
                      >
                        <Languages className="h-3 w-3" aria-hidden="true" />
                        {t('inbox.showTranslation')}
                      </button>
                    ) : null}
                  </div>
                </article>
              </div>
            );
          })}
          {sendingSelectedConversation ? (
            <div className="flex items-center gap-2">
              <span className={cn('hidden h-9 w-9 items-center justify-center rounded-full border sm:inline-flex', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
                <Bot className="h-4 w-4 animate-pulse" aria-hidden="true" />
              </span>
              <div className={cn('rounded-2xl border px-4 py-3 text-sm font-semibold', isLight ? 'border-emerald-200 bg-white text-slate-600 shadow-sm' : 'border-emerald-300/20 bg-white/[0.04] text-slate-300')}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                  Enviando respuesta...
                </span>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={sendMessage}
          className={[
            `${ergonomics.composer} sticky bottom-0 z-10 shrink-0 border-t p-2 sm:p-3`,
            isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#0b1019]/95'
          ].join(' ')}
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          {sendingSelectedConversation ? <p role="status" className="mb-2 text-sm">En proceso. Esperando respuesta del proveedor…</p> : sending ? <p role="status" className="mb-2 text-sm">Hay un envío en proceso en otra conversación. Puedes preparar este borrador mientras termina.</p> : selectedRecovery ? (
            <div role="status" aria-live="polite" className="mb-2 rounded-lg border p-2 text-sm">
              {manualDeliveryText(selectedRecovery.delivery)}
              {selectedRecovery.delivery.status === 'unknown' ? (
                <>
                  <button type="button" className="ml-2 underline" disabled={historyReviewStatus === 'loading'} onClick={reviewManualHistory}>Actualizar historial</button>
                  <p className="mt-1 text-xs">{historyReviewStatus === 'loading' ? 'Actualizando el historial de Staynex…' : historyReviewStatus === 'updated' ? 'Historial actualizado; el resultado sigue sin confirmar. WhatsApp no se ha consultado.' : historyReviewStatus === 'error' ? 'No se pudo actualizar el historial. El resultado sigue sin confirmar.' : 'Solo actualiza el historial de Staynex; no consulta WhatsApp.'}</p>
                </>
              ) : null}
            </div>
          ) : null}
          {replyWillTranslate ? (
            <p className={isLight ? 'mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600' : 'mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-400'}>
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              {t('inbox.replyWillBeSentIn', { language: String(selectedGuestLanguage).toUpperCase() })}
            </p>
          ) : null}
          <div className={ergonomics.quickReplies} data-inbox-actions="quick-replies">
            <InboxActionMenu label="Respuestas rápidas" icon={<Zap size={15} aria-hidden="true" />}>
            {quickReplyTemplates.map((reply) => (
              <button
                key={reply.label}
                type="button"
                onClick={() => {
                  if (reply.label === 'Traducir') {
                    setCopilotOpen(true); setGuestPanelOpen(false);
                    return;
                  }

                  updateComposerDraft(reply.text);
                }}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5',
                  isLight
                    ? 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-emerald-200 hover:text-slate-950'
                    : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-emerald-300/25 hover:bg-white/[0.08] hover:text-white'
                )}
              >
                {reply.label === 'Escalar' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : reply.label === 'Traducir' ? <Languages className="h-3.5 w-3.5" aria-hidden="true" /> : <Zap className="h-3.5 w-3.5" aria-hidden="true" />}
                {reply.label}
              </button>
            ))}
            </InboxActionMenu>
              <button
                type="button"
                onClick={() => { setCopilotOpen((current) => !current); setGuestPanelOpen(false); }}
                aria-expanded={copilotOpen}
                aria-controls="inbox-detail-panel"
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition',
                  copilotOpen
                    ? isLight
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                    : isLight
                      ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                )}
              >
                <Bot className="h-4 w-4" aria-hidden="true" />
                Asistencia IA
                {copilotSignals > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-1.5 text-[10px] font-black text-slate-950">
                    {copilotSignals}
                  </span>
                ) : null}
              </button>

              <label className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold',
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-white/10 bg-white/[0.04] text-slate-200'
              )}
              >
                <span>{t('inbox.readIn')}</span>
                <select
                  value={staffLanguage}
                  onChange={handleTranslationLanguageChange}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs font-bold outline-none',
                    isLight
                      ? 'border-slate-200 bg-slate-50 text-slate-900'
                      : 'border-white/10 bg-[#101724] text-white'
                  )}
                  aria-label={t('inbox.readIn')}
                >
                  {TRANSLATION_LANGUAGES.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
              </label>

          </div>
          <div className={[
            'flex items-end gap-2 rounded-xl border p-2 shadow-inner',
            isLight
              ? 'border-slate-200 bg-slate-50 shadow-slate-200/70'
              : 'border-white/10 bg-black/20 shadow-black/20'
          ].join(' ')}
          >
            <textarea
              aria-label="Respuesta al huésped"
              maxLength={MANUAL_MESSAGE_MAX_LENGTH}
              value={message}
              onChange={(event) => updateComposerDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={t('inbox.replyPlaceholder')}
              rows={2}
              className={[
                'max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-sm leading-6 outline-none transition',
                isLight
                  ? 'text-slate-900 placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white'
                  : 'text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/20 focus:bg-white/[0.025]'
              ].join(' ')}
            />
            <button
              type="submit"
              aria-label={sendingSelectedConversation ? 'Enviando respuesta' : selectedRecovery?.delivery.retryable && selectedRecovery.text === message.trim() ? 'Reintentar envío' : 'Enviar respuesta'}
              disabled={sending || !message.trim() || !recoveryKey || manualSendBlocked || message.trim().length > MANUAL_MESSAGE_MAX_LENGTH}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-200/50 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{sendingSelectedConversation ? 'Enviando...' : sending ? 'Esperando otro envío' : selectedRecovery?.delivery.retryable && selectedRecovery.text === message.trim() ? 'Reintentar' : t('buttons.send')}</span>
            </button>
          </div>
          <p className={ergonomics.composerHint}>Enter para enviar · Mayús + Enter para nueva línea</p>
        </form>
      </section>

      {!selectedConversation ? <div className={ergonomics.welcome}>
        <span className={ergonomics.welcomeIcon}><MessageSquareText size={30} aria-hidden="true" /></span>
        <h2>Todo empieza con una conversación</h2>
        <p>Selecciona un huésped para leer sus mensajes y preparar una respuesta.</p>
        <span>Los mensajes sin leer y las situaciones que requieren atención están en la lista.</span>
      </div> : null}
      {selectedConversation && (copilotOpen || guestPanelOpen) ? (
        <InboxDetailPanel title={guestPanelOpen ? 'Ficha del huésped' : 'Asistencia IA'} onClose={() => { setCopilotOpen(false); setGuestPanelOpen(false); }}>
          {guestPanelOpen ? <div className={ergonomics.guestInfo}>
            <span className={ergonomics.guestAvatar}>{getConversationInitials(selectedConversation)}</span>
            <h3>{selectedDisplayName}</h3>
            <p>{selectedRoomNumber ? `Habitación ${selectedRoomNumber}` : 'Habitación no disponible'}</p>
            <dl>
              <dt>Teléfono</dt><dd>{selectedPhoneNumber || 'No disponible'}</dd>
              <dt>Idioma del huésped</dt><dd>{selectedGuestLanguage ? String(selectedGuestLanguage).toUpperCase() : 'No disponible'}</dd>
              <dt>Llegada</dt><dd>{selectedConversation.pmsIntelligenceContext?.reservation?.arrivalDate || 'No disponible'}</dd>
              <dt>Salida</dt><dd>{selectedConversation.pmsIntelligenceContext?.reservation?.departureDate || 'No disponible'}</dd>
              <dt>Hotel activo</dt><dd>{currentHotel?.name || 'No disponible'}</dd>
              <dt>Control de la conversación</dt><dd>{selectedControlBadge?.label || 'No disponible'}</dd>
              <dt>Estado</dt><dd>{t(`status.${selectedConversation.status || 'unknown'}`)}</dd>
            </dl>
            {selectedHumanTakeoverActive ? <div className={ergonomics.controlNote}>
              <ShieldCheck size={18} aria-hidden="true" /><strong>Recepción tiene el control</strong>
              <p>No se enviarán respuestas automáticas en esta conversación. Resolver un mensaje no devuelve el control a la IA.</p>
              {selectedTakeoverMetadata?.activated_at ? <p>Desde {formatDate(selectedTakeoverMetadata.activated_at)}</p> : null}
              {selectedTakeoverMetadata?.activated_by?.role ? <p>Por {selectedTakeoverMetadata.activated_by.role}</p> : null}
            </div> : null}
            <button className={ergonomics.detailToggle} type="button" onClick={() => { setGuestPanelOpen(false); setCopilotOpen(true); }}><Bot size={16} aria-hidden="true" /> Ver asistencia y acciones IA</button>
          </div> : <InboxAiCopilotPanel conversation={selectedConversation} humanEscalation={selectedHumanEscalation} onOfferAction={updateOfferAction} onClose={() => setCopilotOpen(false)} compact />}
        </InboxDetailPanel>
      ) : null}
      </div>
    </section>
    </MessageAttentionProvider>
  );
};
