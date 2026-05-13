import { getSupabaseAdmin } from './supabase';

const groupMessagesByConversation = (messages) => messages.reduce((groups, message) => {
  const current = groups.get(message.conversation_id) || [];
  current.push(message);
  groups.set(message.conversation_id, current);
  return groups;
}, new Map());

const getLatestAiLogsByConversation = async ({ supabase, conversationIds }) => {
  try {
    const { data, error } = await supabase
      .from('ai_logs')
      .select('conversation_id, needs_human, human_reason, confidence_score, detected_intent, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      throw error;
    }

    return (data || []).reduce((logsByConversation, log) => {
      if (!logsByConversation.has(log.conversation_id)) {
        logsByConversation.set(log.conversation_id, log);
      }

      return logsByConversation;
    }, new Map());
  } catch (error) {
    console.warn('Inbox AI log metadata unavailable', error.message);
    return new Map();
  }
};

export const getInboxConversations = async () => {
  const supabase = getSupabaseAdmin();

  const { data: conversations, error: conversationsError } = await supabase
    .from('conversations')
    .select('id, guest_id, status, last_message_at, created_at')
    .order('last_message_at', { ascending: false });

  if (conversationsError) {
    throw conversationsError;
  }

  if (!conversations?.length) {
    return [];
  }

  const guestIds = [...new Set(conversations.map((conversation) => conversation.guest_id))];
  const conversationIds = conversations.map((conversation) => conversation.id);

  const [{ data: guests, error: guestsError }, { data: messages, error: messagesError }, aiLogsByConversation] = await Promise.all([
    supabase
      .from('guests')
      .select('id, phone_number, current_room')
      .in('id', guestIds),
    supabase
      .from('messages')
      .select('id, conversation_id, sender_type, content, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true }),
    getLatestAiLogsByConversation({ supabase, conversationIds })
  ]);

  if (guestsError) {
    throw guestsError;
  }

  if (messagesError) {
    throw messagesError;
  }

  const guestsById = new Map((guests || []).map((guest) => [guest.id, guest]));
  const messagesByConversation = groupMessagesByConversation(messages || []);

  return conversations.map((conversation) => {
    const conversationMessages = messagesByConversation.get(conversation.id) || [];
    const lastMessage = conversationMessages[conversationMessages.length - 1] || null;

    return {
      ...conversation,
      guest: guestsById.get(conversation.guest_id) || null,
      messages: conversationMessages,
      lastMessage,
      aiLog: aiLogsByConversation.get(conversation.id) || null
    };
  });
};
