'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, RefreshCw, Send } from 'lucide-react';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
import { translateMessageForStaff } from '@/lib/i18n/translateMessageForStaff';
import { useDashboardTheme } from '@/lib/theme/useDashboardTheme';

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

const INBOX_READ_STATE_KEY = 'staynex_inbox_read_state';
const INBOX_UNREAD_TOTAL_KEY = 'staynex_inbox_unread_total';
const INBOX_HUMAN_TOTAL_KEY = 'staynex_inbox_human_total';
export const INBOX_UNREAD_EVENT = 'staynex:inbox-unread-updated';
export const INBOX_HUMAN_EVENT = 'staynex:inbox-human-updated';

const readStoredReadState = () => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(INBOX_READ_STATE_KEY) || '{}');
  } catch (error) {
    console.error('Inbox read state could not be parsed', error);
    return {};
  }
};

const persistReadState = (nextState) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(INBOX_READ_STATE_KEY, JSON.stringify(nextState));
};

const dispatchUnreadTotal = (total) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(INBOX_UNREAD_TOTAL_KEY, String(total));
  window.dispatchEvent(new CustomEvent(INBOX_UNREAD_EVENT, {
    detail: { total }
  }));
};

const dispatchHumanTotal = (total) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(INBOX_HUMAN_TOTAL_KEY, String(total));
  window.dispatchEvent(new CustomEvent(INBOX_HUMAN_EVENT, {
    detail: { total }
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
      needsHuman: true,
      reason: 'low_confidence'
    };
  }

  if (aiLog?.detected_intent === 'unknown') {
    return {
      needsHuman: true,
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

    return {
      ...conversation,
      last_message_at: message.created_at,
      lastMessage: message,
      messages: [...conversation.messages, message]
    };
  })
);

export const InboxClient = ({ conversations }) => {
  const { language, t } = useDashboardLanguage();
  const { theme } = useDashboardTheme();
  const isLight = theme === 'light';
  const sortedConversations = useMemo(() => sortConversations(conversations), [conversations]);
  const [items, setItems] = useState(sortedConversations);
  const [selectedId, setSelectedId] = useState(sortedConversations[0]?.id || null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [hiddenTranslations, setHiddenTranslations] = useState({});
  const [readState, setReadState] = useState({});
  const [readStateLoaded, setReadStateLoaded] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

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
    setReadState(readStoredReadState());
    setReadStateLoaded(true);
  }, []);

  useEffect(() => {
    if (readStateLoaded) {
      dispatchUnreadTotal(unreadTotal);
    }
  }, [readStateLoaded, unreadTotal]);

  useEffect(() => {
    dispatchHumanTotal(humanTotal);
  }, [humanTotal]);

  const markConversationAsRead = (conversationId) => {
    if (!conversationId) {
      return;
    }

    setReadState((current) => {
      const nextState = {
        ...current,
        [conversationId]: new Date().toISOString()
      };

      persistReadState(nextState);
      return nextState;
    });
  };

  useEffect(() => {
    if (readStateLoaded && selectedId) {
      markConversationAsRead(selectedId);
    }
  }, [readStateLoaded, selectedId]);

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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: message.trim()
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
    } catch (error) {
      console.error('Staff message send failed', error);
    } finally {
      setSending(false);
    }
  };

  const toggleTranslation = (messageId) => {
    setHiddenTranslations((current) => ({
      ...current,
      [messageId]: !current[messageId]
    }));
  };

  if (items.length === 0) {
    return (
      <div className={[
        'rounded-lg border border-dashed px-6 py-12 text-center shadow-2xl',
        isLight
          ? 'border-slate-300 bg-white text-slate-900 shadow-slate-200/70'
          : 'border-white/10 bg-white/[0.035] shadow-black/10'
      ].join(' ')}
      >
        <p className={isLight ? 'text-sm font-medium text-slate-900' : 'text-sm font-medium text-slate-200'}>{t('inbox.noConversations')}</p>
        <p className={isLight ? 'mt-2 text-sm text-slate-600' : 'mt-2 text-sm text-slate-500'}>{t('inbox.noConversationsDescription')}</p>
      </div>
    );
  }

  return (
    <div
      className={[
        'grid min-h-[680px] overflow-hidden rounded-lg border shadow-2xl backdrop-blur lg:h-[calc(100vh-220px)] lg:min-h-[560px] lg:grid-cols-[380px_1fr]',
        isLight
          ? 'border-slate-200 bg-white shadow-slate-200/80'
          : 'border-white/10 bg-[#0b1019]/88 shadow-black/25'
      ].join(' ')}
    >
      <aside className={[
        'flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r',
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
              {unreadTotal > 0 ? ` · ${t('inbox.unreadTotal', { count: unreadTotal })}` : ''}
              {humanTotal > 0 ? ` · ${t('inbox.humanTotal', { count: humanTotal })}` : ''}
            </p>
          </div>
          <form action="/dashboard/inbox">
            <button
              type="submit"
              className={[
                'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
                isLight
                  ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  : 'border-white/10 bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-100'
              ].join(' ')}
              title={t('buttons.refresh')}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t('buttons.refresh')}</span>
            </button>
          </form>
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

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleItems.length === 0 ? (
            <div className={isLight ? 'rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500' : 'rounded-lg border border-dashed border-white/10 bg-white/[0.025] px-4 py-8 text-center text-sm text-slate-500'}>
              {t('inbox.noNeedsHuman')}
            </div>
          ) : null}
          {visibleItems.map((conversation) => {
            const active = conversation.id === selectedId;
            const lastMessage = conversation.lastMessage;
            const unreadCount = getUnreadCount(conversation, readState);
            const unread = unreadCount > 0;
            const humanEscalation = getHumanEscalation(conversation);
            const needsAttention = humanEscalation.needsHuman || getNeedsAttention(conversation, unreadCount);
            const isNew = getIsNewConversation(conversation, readState);

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedId(conversation.id);
                  markConversationAsRead(conversation.id);
                }}
                className={[
                  'relative block w-full rounded-lg border px-4 py-4 text-left transition',
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
                <p className={isLight ? 'mt-3 text-xs text-slate-500' : 'mt-3 text-xs text-slate-600'}>
                  {formatDate(conversation.last_message_at || conversation.created_at)}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden">
        <header className={[
          'shrink-0 border-b px-6 py-5',
          isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/[0.025]'
        ].join(' ')}
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={isLight ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-white'}>
                {t('table.room')} {selectedConversation?.guest?.current_room || t('status.unknown').toLowerCase()}
              </p>
              <p className={isLight ? 'text-xs text-slate-600' : 'text-xs text-slate-500'}>
                {selectedConversation?.guest?.phone_number || t('inbox.noPhone')}
              </p>
            </div>
            <span className={[
              'w-fit rounded-full border px-3 py-1 text-xs capitalize',
              selectedHumanEscalation.needsHuman
                ? isLight
                  ? 'border-orange-200 bg-orange-50 text-orange-800'
                  : 'border-orange-300/20 bg-orange-400/10 text-orange-100'
                : isLight
                  ? 'border-slate-200 bg-slate-50 text-slate-700'
                  : 'border-white/10 bg-white/[0.04] text-slate-300'
            ].join(' ')}
            >
              {selectedHumanEscalation.needsHuman
                ? t('inbox.needsHuman')
                : t(`status.${selectedConversation?.status || 'unknown'}`)}
            </span>
          </div>
        </header>

        {selectedHumanEscalation.needsHuman ? (
          <div className={isLight ? 'shrink-0 border-b border-orange-200 bg-orange-50 px-6 py-4 text-orange-900' : 'shrink-0 border-b border-orange-300/20 bg-orange-400/[0.08] px-6 py-4 text-orange-100'}>
            <div className="flex items-start gap-3">
              <span className={isLight ? 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-700 shadow-sm' : 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-400/10 text-orange-200'}>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">{t('inbox.receptionAttentionRequired')}</p>
                <p className={isLight ? 'mt-1 text-xs text-orange-800' : 'mt-1 text-xs text-orange-100/75'}>
                  {t('inbox.humanReason', {
                    reason: t(`inbox.humanReasons.${selectedHumanEscalation.reason || 'fallback_response'}`)
                  })}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className={[
          'min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-6 sm:px-6',
          isLight ? 'bg-slate-50' : 'bg-[#080c14]/45'
        ].join(' ')}
        >
          {selectedConversation?.messages.map((item) => {
            const isStaff = item.sender_type === 'staff';
            const staffTranslation = translateMessageForStaff({
              message: item.content,
              targetLanguage: language
            });
            const hasTranslation = Boolean(staffTranslation.translation);
            const translationVisible = hasTranslation && !hiddenTranslations[item.id];

            return (
              <div
                key={item.id}
                className={[
                  'flex',
                  isStaff ? 'justify-end' : 'justify-start'
                ].join(' ')}
              >
                <article className={[
                  'max-w-[min(82%,760px)] rounded-lg border px-4 py-3.5',
                  isStaff ? 'rounded-br-md' : 'rounded-bl-md',
                  senderStyles[theme][item.sender_type] || senderStyles[theme].guest
                ].join(' ')}
                >
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <p className={[
                      'text-xs font-semibold',
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
                    </p>
                    <p className={isLight ? 'text-xs text-slate-500' : 'text-xs opacity-60'}>{formatTime(item.created_at)}</p>
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
                            {t('inbox.staffTranslation')}
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
                            {staffTranslation.translation}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={sendMessage}
          className={[
            'shrink-0 border-t p-4',
            isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#0b1019]/95'
          ].join(' ')}
        >
          <div className={[
            'flex gap-2 rounded-lg border p-2 shadow-inner',
            isLight
              ? 'border-slate-200 bg-slate-50 shadow-slate-200/70'
              : 'border-white/10 bg-black/20 shadow-black/20'
          ].join(' ')}
          >
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('inbox.replyPlaceholder')}
              className={[
                'min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-3 py-2 text-sm outline-none transition',
                isLight
                  ? 'text-slate-900 placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white'
                  : 'text-slate-100 placeholder:text-slate-600 focus:border-emerald-300/20 focus:bg-white/[0.025]'
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="inline-flex items-center gap-2 rounded-md border border-emerald-200/50 bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/15 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {t('buttons.send')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
