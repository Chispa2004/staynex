'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, Eye, EyeOff, Languages, MessageSquareText, RefreshCw, Send, Sparkles, UserRound, X, Zap } from 'lucide-react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { translateMessageForStaff } from '@/lib/i18n/translateMessageForStaff';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';
import { getAuthHeaders } from '@/lib/auth-headers';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { buildConversationCopilot } from '@/lib/ai-copilot';
import { InboxAiCopilotPanel } from './InboxAiCopilotPanel';
import { PremiumEmptyState } from './PremiumEmptyState';
import { cn, ui } from '@/lib/ui/styles';
import { shouldAcceptTenantPayload } from '@/lib/tenant-client';

const formatDate = (value) => {
  if (!value) {
    return 'No date';
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
  { label: 'Late checkout', text: 'Of course, I can check late checkout availability for you.' },
  { label: 'Restaurant', text: 'I can help with restaurant recommendations or a table request.' },
  { label: 'Transfer', text: 'I can help arrange a transfer. What time would you like to travel?' },
  { label: 'Spa', text: 'I can check spa options and availability for you.' },
  { label: 'Escalate', text: 'I will ask reception to review this personally.' },
  { label: 'Translate', text: '' },
  { label: 'Create ticket', text: 'I will create a ticket so the team can follow up.' }
];

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

const getMessageTranslationFromMetadata = (message, targetLanguage) => {
  const normalizedTarget = normalizeTranslationLanguage(targetLanguage);
  const cached = message?.metadata?.translations?.[normalizedTarget];

  if (!cached?.translated_text) {
    return null;
  }

  return {
    translation: cached.translated_text,
    sourceLanguage: cached.source_language || message.original_language || null,
    targetLanguage: cached.target_language || normalizedTarget,
    provider: cached.provider || 'cache'
  };
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

const getConversationMessageCount = (conversations, conversationId) => (
  conversations.find((conversation) => conversation.id === conversationId)?.messages?.length || 0
);

export const InboxClient = ({ conversations }) => {
  const searchParams = useSearchParams();
  const { language, t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const sortedConversations = useMemo(() => normalizeInboxConversations(conversations), [conversations]);
  const requestedConversationId = searchParams.get('conversationId');
  const [items, setItems] = useState(sortedConversations);
  const [selectedId, setSelectedId] = useState(
    requestedConversationId || sortedConversations[0]?.id || null
  );
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hiddenTranslations, setHiddenTranslations] = useState({});
  const [readState, setReadState] = useState({});
  const [readStateLoaded, setReadStateLoaded] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentHotel, setCurrentHotel] = useState(null);
  const [staffLanguage, setStaffLanguage] = useState(normalizeTranslationLanguage(language || 'es'));
  const [translationOverrides, setTranslationOverrides] = useState({});
  const [translatingMessages, setTranslatingMessages] = useState({});
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [refreshing, setRefreshing] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(Boolean(requestedConversationId));
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
  const visibleItems = useMemo(() => (
    activeFilter === 'needsHuman'
      ? items.filter((conversation) => getHumanEscalation(conversation).needsHuman)
      : items
  ), [activeFilter, items]);

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
    if (!currentHotel?.id) {
      setReadState({});
      setReadStateLoaded(false);
      return;
    }

    setReadState(readStoredReadState(currentHotel.id));
    setReadStateLoaded(true);
  }, [currentHotel?.id]);

  useEffect(() => {
    if (requestedConversationId && items.some((conversation) => conversation.id === requestedConversationId)) {
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
        setCopilotOpen(false);
        setMobileChatOpen(false);
      }

      setCurrentHotel(body.hotel || null);
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

        if (preserveSelection && currentSelection && nextItems.some((conversation) => conversation.id === currentSelection)) {
          return currentSelection;
        }

        if (current && nextItems.some((conversation) => conversation.id === current)) {
          return current;
        }

        return requestedConversationId || nextItems[0]?.id || null;
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
      setReadState({});
      setReadStateLoaded(false);
      setCopilotOpen(false);
      setMobileChatOpen(false);
      setStaffLanguage(normalizeTranslationLanguage(language || 'es'));
      setTranslationOverrides({});
      setTranslatingMessages({});
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
      return;
    }

    const messagesAfter = getConversationMessageCount(nextItems, selectedBeforeReload);
    const hasNewActiveMessages = messagesAfter > messagesBefore;

    if (hasNewActiveMessages) {
      markConversationAsRead(selectedBeforeReload);
    }

    if (wasNearBottom && hasNewActiveMessages) {
      scrollMessagesToBottom('smooth');
    }
  }, [isMessagesPanelNearBottom, loadInbox, markConversationAsRead, scrollMessagesToBottom]);

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

    if (!supabase) {
      console.warn('Inbox Realtime unavailable: missing Supabase browser client');
      setRealtimeStatus('fallback');
      return undefined;
    }

    const channel = supabase
      .channel(`dashboard-inbox-${currentHotel?.id || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
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
          ...(currentHotel?.id ? { filter: `hotel_id=eq.${currentHotel.id}` } : {})
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
          ...(currentHotel?.id ? { filter: `hotel_id=eq.${currentHotel.id}` } : {})
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
          ...(currentHotel?.id ? { filter: `hotel_id=eq.${currentHotel.id}` } : {})
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
          ...(currentHotel?.id ? { filter: `hotel_id=eq.${currentHotel.id}` } : {})
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
          ...(currentHotel?.id ? { filter: `hotel_id=eq.${currentHotel.id}` } : {})
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

    if (!selectedConversation || !message.trim()) {
      return;
    }

    setSending(true);

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: message.trim(),
          staffLanguage
        })
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'Could not send message');
      }

      setItems((current) => updateConversationWithMessage({
        conversations: current,
        conversationId: selectedConversation.id,
        message: body.message
      }));
      markConversationAsRead(selectedConversation.id);
      setMessage('');
      scrollMessagesToBottom('smooth');
    } catch (error) {
      console.error('Staff message send failed', error);
    } finally {
      setSending(false);
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

    if (sourceLanguage && sourceLanguage === normalizedTarget) {
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
  }, [translatingMessages, translationOverrides]);

  useEffect(() => {
    if (!selectedConversation?.messages?.length || !staffLanguage) {
      return;
    }

    selectedConversation.messages
      .filter((item) => ['guest', 'ai'].includes(item.sender_type))
      .slice(-20)
      .forEach((item) => {
        const sourceLanguage = item.original_language || translateMessageForStaff({
          message: item.content,
          targetLanguage: staffLanguage
        }).sourceLanguage;
        const key = `${item.id}:${staffLanguage}`;
        const cached = getMessageTranslationFromMetadata(item, staffLanguage);

        if (
          sourceLanguage
          && sourceLanguage !== staffLanguage
          && !cached
          && !translationOverrides[key]
          && !translatingMessages[key]
        ) {
          requestMessageTranslation(item, staffLanguage);
        }
      });
  }, [requestMessageTranslation, selectedConversation?.id, selectedConversation?.messages, staffLanguage, translatingMessages, translationOverrides]);

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

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  if (items.length === 0) {
    return (
      <PremiumEmptyState
        icon={Bot}
        title={t('inbox.noConversations')}
        description={t('inbox.noConversationsDescription')}
      />
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
  const inboxGridColumns = copilotOpen
    ? 'lg:grid-cols-[360px_minmax(0,1fr)_360px]'
    : 'lg:grid-cols-[360px_minmax(0,1fr)]';
  const selectedGuestLanguage = selectedConversation?.guest?.preferred_language
    || [...(selectedConversation?.messages || [])].reverse().find((item) => item.sender_type === 'guest')?.original_language
    || null;
  const replyWillTranslate = Boolean(selectedGuestLanguage && selectedGuestLanguage !== staffLanguage);

  return (
    <div
      className={[
        'premium-fade-in relative grid h-[calc(100dvh-92px)] min-h-[520px] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur sm:h-[calc(100dvh-118px)] lg:h-[calc(100vh-190px)] lg:min-h-[560px]',
        inboxGridColumns,
        isLight
          ? 'border-slate-200 bg-white shadow-slate-200/80'
          : 'border-white/10 bg-gradient-to-br from-[#0b1019]/95 via-[#0b1019]/88 to-[#101827]/90 shadow-black/25'
      ].join(' ')}
    >
      <aside className={[
        mobileChatOpen ? 'hidden lg:flex' : 'flex',
        'min-h-0 flex-col border-b lg:border-b-0 lg:border-r',
        isLight ? 'border-slate-200 bg-slate-50/80' : 'border-white/10 bg-black/10'
      ].join(' ')}
      >
        <div className={[
          'flex shrink-0 items-center justify-between border-b px-5 py-4',
          isLight ? 'border-slate-200 bg-white' : 'border-white/10'
        ].join(' ')}
        >
          <div>
            <p className={isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-white'}>{t('inbox.conversations')}</p>
            <p className={isLight ? 'text-xs text-slate-600' : 'text-xs text-slate-500'}>
              {t('inbox.activeThreads', { count: items.length })}
              {unreadTotal > 0 ? ` - ${t('inbox.unreadTotal', { count: unreadTotal })}` : ''}
              {humanTotal > 0 ? ` - ${t('inbox.humanTotal', { count: humanTotal })}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={[
                'hidden rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] sm:inline-flex',
                realtimeStatus === 'connected'
                  ? isLight
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                  : isLight
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-amber-300/20 bg-amber-300/10 text-amber-100'
              ].join(' ')}
            >
              {realtimeStatus === 'connected' ? 'Live' : 'Fallback'}
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

        <div className={[
          'flex shrink-0 gap-2 border-b p-3',
          isLight ? 'border-slate-200 bg-white/80' : 'border-white/10 bg-black/10'
        ].join(' ')}
        >
          {[
            { key: 'all', label: t('filters.all'), count: items.length },
            { key: 'needsHuman', label: t('inbox.needsHumanFilter'), count: humanTotal }
          ].map((filter) => {
            const active = activeFilter === filter.key;

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={[
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition',
                  isLight
                    ? active
                      ? 'border-orange-200 bg-orange-50 text-orange-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    : active
                      ? 'border-orange-300/25 bg-orange-400/10 text-orange-100'
                      : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
                ].join(' ')}
              >
                {filter.label}
                {filter.count > 0 ? (
                  <span className={active ? 'rounded-full bg-orange-300 px-1.5 py-0.5 text-[10px] font-black text-slate-950' : 'rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-700'}>
                    {filter.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="executive-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {visibleItems.length === 0 ? (
            <PremiumEmptyState
              icon={AlertTriangle}
              title={t('inbox.noNeedsHuman')}
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
            const isNew = getIsNewConversation(conversation, readState);
            const hasUpsell = (conversation.upsells || []).length > 0;
            const hasOffer = (conversation.offers || []).length > 0;
            const hasExperienceBooking = (conversation.experienceBookings || []).length > 0;
            const aiState = conversation.aiState;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedId(conversation.id);
                  markConversationAsRead(conversation.id);
                  setMobileChatOpen(true);
                }}
                className={[
              'premium-fade-in relative block w-full rounded-xl border px-4 py-4 text-left transition duration-200 hover:-translate-y-0.5',
                  isLight
                    ? active
                      ? 'border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100'
                      : needsAttention
                        ? 'border-red-200 bg-red-50/80 shadow-sm shadow-red-100'
                        : unread
                          ? 'border-emerald-200 bg-emerald-50/65 shadow-sm shadow-emerald-100'
                          : 'border-transparent hover:border-slate-200 hover:bg-white'
                    : active
                      ? 'border-emerald-300/20 bg-white/[0.075] shadow-lg shadow-black/10'
                      : needsAttention
                        ? 'border-red-300/25 bg-red-500/[0.08] shadow-lg shadow-red-950/10'
                        : unread
                          ? 'border-emerald-300/20 bg-emerald-300/[0.055] shadow-lg shadow-emerald-950/10'
                          : 'border-transparent hover:border-white/10 hover:bg-white/[0.04]'
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {unread ? (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-300 shadow-lg shadow-emerald-400/60" />
                      ) : null}
                      <p className={isLight ? `truncate text-sm ${unread ? 'font-bold text-slate-950' : 'font-semibold text-slate-900'}` : `truncate text-sm ${unread ? 'font-bold text-white' : 'font-semibold text-slate-100'}`}>
                        {t('table.room')} {conversation.guest?.current_room || t('status.unknown').toLowerCase()}
                      </p>
                    </div>
                    <p className={isLight ? 'mt-1 text-xs text-slate-500' : 'mt-1 text-xs text-slate-500'}>
                      {formatTime(conversation.last_message_at || conversation.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {needsAttention ? (
                      <span className={[
                        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold',
                        isLight
                          ? humanEscalation.needsHuman
                            ? 'border-orange-200 bg-white text-orange-800'
                            : 'border-red-200 bg-white text-red-700'
                          : humanEscalation.needsHuman
                            ? 'border-orange-300/20 bg-orange-400/15 text-orange-100'
                            : 'border-red-300/20 bg-red-500/15 text-red-100'
                      ].join(' ')}
                      >
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {humanEscalation.needsHuman ? t('inbox.needsHuman') : t('inbox.needsAttention')}
                      </span>
                    ) : null}
                    {unread ? (
                      <span className="rounded-full bg-emerald-300 px-2 py-1 text-[11px] font-black text-slate-950 shadow-lg shadow-emerald-500/20">
                        {unreadCount > 9 ? '9+' : t('inbox.newCount', { count: unreadCount })}
                      </span>
                    ) : hasExperienceBooking ? (
                      <span className={isLight ? 'rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800' : 'rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-100'}>
                        Experience request
                      </span>
                    ) : hasOffer ? (
                      <span className={isLight ? 'rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800' : 'rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[11px] font-semibold text-emerald-100'}>
                        AI Offer
                      </span>
                    ) : hasUpsell ? (
                      <span className={isLight ? 'rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-800' : 'rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-1 text-[11px] font-semibold text-violet-100'}>
                        Upsell opportunity
                      </span>
                    ) : isNew ? (
                      <span className={isLight ? 'rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800' : 'rounded-full border border-sky-300/20 bg-sky-400/10 px-2 py-1 text-[11px] font-semibold text-sky-100'}>
                        {t('inbox.newConversation')}
                      </span>
                    ) : (
                      <span className={[
                        'rounded-full border px-2.5 py-1 text-xs capitalize',
                        isLight
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100'
                      ].join(' ')}
                      >
                        {t(`status.${conversation.status || 'unknown'}`)}
                      </span>
                    )}
                  </div>
                </div>
                <p className={isLight ? `mt-2 line-clamp-2 text-sm ${unread ? 'font-semibold text-slate-800' : 'text-slate-600'}` : `mt-2 line-clamp-2 text-sm ${unread ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>
                  {lastMessage?.content || t('inbox.noMessages')}
                </p>
                {aiState?.current_intent ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className={ui.badge(isLight, 'violet', true)}>
                      {aiState.current_intent}
                    </span>
                  </div>
                ) : null}
                <p className={isLight ? 'mt-3 text-xs text-slate-500' : 'mt-3 text-xs text-slate-600'}>
                  {formatDate(conversation.last_message_at || conversation.created_at)}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={[
        !mobileChatOpen ? 'hidden lg:flex' : 'flex',
        'min-h-0 flex-col overflow-hidden'
      ].join(' ')}
      >
        <header className={[
              'shrink-0 border-b px-3 py-3 sm:px-5 sm:py-4',
              isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/[0.035]'
        ].join(' ')}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileChatOpen(false)}
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition lg:hidden',
                  isLight
                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
                )}
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className={isLight ? 'truncate text-sm font-semibold text-slate-900' : 'truncate text-sm font-semibold text-white'}>
                  {t('table.room')} {selectedConversation?.guest?.current_room || t('status.unknown').toLowerCase()}
                </p>
                <p className={isLight ? 'truncate text-xs text-slate-600' : 'truncate text-xs text-slate-500'}>
                  {selectedConversation?.guest?.phone_number || t('inbox.noPhone')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
              <span className={[
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
              </span>
              <button
                type="button"
                onClick={() => setCopilotOpen((current) => !current)}
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
                AI Copilot
                {copilotSignals > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-1.5 text-[10px] font-black text-slate-950">
                    {copilotSignals}
                  </span>
                ) : null}
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
          'executive-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6',
          isLight ? 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_32%),#f8fafc]' : 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.10),transparent_35%),#080c14]/70'
        ].join(' ')}
        ref={messagesScrollRef}
        >
          {(selectedConversation?.messages || []).map((item) => {
            const isStaff = item.sender_type === 'staff';
            const translationKey = `${item.id}:${staffLanguage}`;
            const fallbackTranslation = item.sender_type === 'guest'
              ? translateMessageForStaff({
                message: item.content,
                targetLanguage: staffLanguage || language
              })
              : { translation: null, sourceLanguage: item.original_language || null, targetLanguage: item.translated_language || null };
            const metadataTranslation = getMessageTranslationFromMetadata(item, staffLanguage);
            const directTranslation = item.translated_text && item.translated_language === staffLanguage
              ? {
                translation: item.translated_text,
                sourceLanguage: item.original_language || fallbackTranslation.sourceLanguage,
                targetLanguage: item.translated_language || fallbackTranslation.targetLanguage,
                provider: item.translation_provider
              }
              : null;
            const messageTranslation = translationOverrides[translationKey] || metadataTranslation || directTranslation || fallbackTranslation;
            const hasTranslation = Boolean(messageTranslation.translation);
            const isTranslating = Boolean(translatingMessages[translationKey]);
            const translationVisible = hasTranslation && !hiddenTranslations[item.id];
            const languageBadge = item.original_language || messageTranslation.sourceLanguage || null;
            const translationLabel = isStaff ? t('inbox.guestTranslation') : t('inbox.staffTranslation');
            const alreadyInStaffLanguage = !hasTranslation && languageBadge && languageBadge === staffLanguage;
            const isAi = item.sender_type === 'ai';
            const SenderIcon = isAi ? Bot : isStaff ? UserRound : MessageSquareText;
            const senderAvatarClass = isLight
              ? isAi
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-100'
                : isStaff
                  ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sky-100'
                  : 'border-slate-200 bg-white text-slate-600 shadow-slate-200'
              : isAi
                ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 shadow-emerald-950/20'
                : isStaff
                  ? 'border-sky-300/20 bg-sky-300/10 text-sky-100 shadow-sky-950/20'
                  : 'border-white/10 bg-white/[0.055] text-slate-300 shadow-black/20';

            return (
              <div
                key={item.id}
                className={[
                  'premium-fade-in flex items-end gap-2',
                  isStaff ? 'justify-end' : 'justify-start'
                ].join(' ')}
              >
                {!isStaff ? (
                  <span className={cn('mb-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-lg sm:inline-flex', senderAvatarClass)}>
                    <SenderIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
                <article className={[
                  'max-w-[min(90%,760px)] rounded-2xl border px-3 py-3 transition duration-200 sm:max-w-[min(82%,760px)] sm:px-4 sm:py-3.5',
                  isStaff ? 'rounded-br-md' : 'rounded-bl-md',
                  senderStyles[theme][item.sender_type] || senderStyles[theme].guest
                ].join(' ')}
                >
                  <div className="mb-2 flex items-center justify-between gap-4">
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
                          AI
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
                      {isStaff ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : null}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className={isLight ? 'mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500' : 'mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-55'}>
                        {t('inbox.original')}
                      </p>
                      <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
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
                    ) : alreadyInStaffLanguage ? (
                      <p className={isLight ? 'border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500' : 'border-t border-white/10 pt-3 text-xs font-semibold text-slate-500'}>
                        {t('inbox.alreadyInYourLanguage')}
                      </p>
                    ) : null}
                  </div>
                </article>
                {isStaff ? (
                  <span className={cn('mb-1 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-lg sm:inline-flex', senderAvatarClass)}>
                    <SenderIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                ) : null}
              </div>
            );
          })}
          {sending ? (
            <div className="flex items-center gap-2">
              <span className={cn('hidden h-9 w-9 items-center justify-center rounded-full border sm:inline-flex', isLight ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100')}>
                <Bot className="h-4 w-4 animate-pulse" aria-hidden="true" />
              </span>
              <div className={cn('rounded-2xl border px-4 py-3 text-sm font-semibold', isLight ? 'border-emerald-200 bg-white text-slate-600 shadow-sm' : 'border-emerald-300/20 bg-white/[0.04] text-slate-300')}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                  AI thinking...
                </span>
              </div>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={sendMessage}
          className={[
            'sticky bottom-0 z-10 shrink-0 border-t p-2 sm:p-4',
            isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#0b1019]/95'
          ].join(' ')}
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          {replyWillTranslate ? (
            <p className={isLight ? 'mb-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600' : 'mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-400'}>
              <Languages className="h-3.5 w-3.5" aria-hidden="true" />
              {t('inbox.replyWillBeSentIn', { language: String(selectedGuestLanguage).toUpperCase() })}
            </p>
          ) : null}
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {quickReplyTemplates.map((reply) => (
              <button
                key={reply.label}
                type="button"
                onClick={() => {
                  if (reply.label === 'Translate') {
                    setCopilotOpen(true);
                    return;
                  }

                  setMessage(reply.text);
                }}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5',
                  isLight
                    ? 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-emerald-200 hover:text-slate-950'
                    : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-emerald-300/25 hover:bg-white/[0.08] hover:text-white'
                )}
              >
                {reply.label === 'Escalate' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : reply.label === 'Translate' ? <Languages className="h-3.5 w-3.5" aria-hidden="true" /> : <Zap className="h-3.5 w-3.5" aria-hidden="true" />}
                {reply.label}
              </button>
            ))}
          </div>
          <div className={[
            'flex items-end gap-2 rounded-xl border p-2 shadow-inner',
            isLight
              ? 'border-slate-200 bg-slate-50 shadow-slate-200/70'
              : 'border-white/10 bg-black/20 shadow-black/20'
          ].join(' ')}
          >
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={t('inbox.replyPlaceholder')}
              rows={1}
              className={[
                'max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-sm leading-6 outline-none transition',
                isLight
                  ? 'text-slate-900 placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white'
                  : 'text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/20 focus:bg-white/[0.025]'
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-200/50 bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{sending ? 'Sending...' : t('buttons.send')}</span>
            </button>
          </div>
          <div className={cn('mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] font-semibold', isLight ? 'text-slate-500' : 'text-slate-500')}>
            <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden="true" /> Sent indicator active</span>
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" aria-hidden="true" /> AI-assisted replies</span>
          </div>
        </form>
      </section>

      {copilotOpen ? (
        <div className={[
          'hidden min-h-0 border-l lg:block',
          isLight ? 'border-slate-200' : 'border-white/10'
        ].join(' ')}
        >
          <InboxAiCopilotPanel
            conversation={selectedConversation}
            humanEscalation={selectedHumanEscalation}
            onOfferAction={updateOfferAction}
            onClose={() => setCopilotOpen(false)}
          />
        </div>
      ) : null}

      {copilotOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-sm lg:hidden">
          <div className="h-full w-full max-w-[420px] shadow-2xl">
            <InboxAiCopilotPanel
              conversation={selectedConversation}
              humanEscalation={selectedHumanEscalation}
              onOfferAction={updateOfferAction}
              onClose={() => setCopilotOpen(false)}
              compact
            />
          </div>
          <button
            type="button"
            onClick={() => setCopilotOpen(false)}
            className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white shadow-lg sm:hidden"
            aria-label="Close AI Copilot"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
};
