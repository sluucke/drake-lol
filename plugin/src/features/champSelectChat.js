export const CONVERSATIONS_ROUTE = '/lol-chat/v1/conversations';

export async function resolveChampSelectConversationId(lcu, session) {
  const directId =
    session?.chatDetails?.chatRoomName ||
    session?.chatDetails?.multiUserChatId ||
    session?.chatDetails?.mucJwtDto?.channelClaim ||
    session?.multiUserChatId ||
    session?.chatRoomName ||
    null;

  if (typeof directId === 'string' && directId.trim() && !directId.includes('@')) {
    return directId.trim();
  }

  if (lcu && typeof lcu.get === 'function') {
    try {
      const conversations = await lcu.get(CONVERSATIONS_ROUTE);
      if (Array.isArray(conversations)) {
        const match = conversations.find(
          (c) =>
            c?.type === 'championSelect' ||
            c?.type === 'champSelect' ||
            (directId &&
              (c?.id === directId ||
                c?.name === directId ||
                c?.id === directId.split('@')[0] ||
                c?.name === directId.split('@')[0])),
        );
        if (match?.id) {
          return String(match.id);
        }
      }
    } catch {
      // ignore
    }
  }

  if (typeof directId === 'string' && directId.trim()) {
    return directId.trim();
  }

  return null;
}

export async function sendChampSelectMessage(lcu, session, message) {
  if (typeof message !== 'string' || !message.trim()) {
    return { success: false, error: 'Empty message' };
  }

  if (!lcu || typeof lcu.post !== 'function') {
    return { success: false, error: 'LCU unavailable' };
  }

  let conversationId;
  try {
    conversationId = await resolveChampSelectConversationId(lcu, session);
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to resolve conversation' };
  }

  if (!conversationId) {
    return { success: false, error: 'Conversation not found' };
  }

  try {
    const route = `/lol-chat/v1/conversations/${conversationId}/messages`;
    const res = await lcu.post(route, { body: message.trim(), type: 'chat' });
    if (res && res.ok === false) {
      return { success: false, conversationId, error: res.statusText || 'Failed to send message' };
    }
    return { success: true, conversationId };
  } catch (err) {
    return { success: false, conversationId, error: err?.message || 'Failed to send message' };
  }
}
