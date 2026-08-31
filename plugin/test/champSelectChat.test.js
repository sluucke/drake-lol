import { describe, it, expect, vi } from 'vitest';
import {
  CONVERSATIONS_ROUTE,
  resolveChampSelectConversationId,
  sendChampSelectMessage,
} from '../src/features/champSelectChat.js';

describe('resolveChampSelectConversationId', () => {
  it('resolves direct id from chatRoomName without querying LCU when no @ is present', async () => {
    const lcu = { get: vi.fn() };
    const session = {
      chatDetails: {
        chatRoomName: 'room-12345',
      },
    };

    const id = await resolveChampSelectConversationId(lcu, session);
    expect(id).toBe('room-12345');
    expect(lcu.get).not.toHaveBeenCalled();
  });

  it('resolves direct id from multiUserChatId without querying LCU', async () => {
    const lcu = { get: vi.fn() };
    const session = {
      chatDetails: {
        multiUserChatId: 'muc-abcdef',
      },
    };

    const id = await resolveChampSelectConversationId(lcu, session);
    expect(id).toBe('muc-abcdef');
    expect(lcu.get).not.toHaveBeenCalled();
  });

  it('resolves direct id from mucJwtDto channelClaim without querying LCU', async () => {
    const lcu = { get: vi.fn() };
    const session = {
      chatDetails: {
        mucJwtDto: {
          channelClaim: 'claim-xyz',
        },
      },
    };

    const id = await resolveChampSelectConversationId(lcu, session);
    expect(id).toBe('claim-xyz');
    expect(lcu.get).not.toHaveBeenCalled();
  });

  it('queries /lol-chat/v1/conversations when room is formatted as JID with @ and finds championSelect type', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 'general-chat', type: 'custom' },
        { id: 'champ-select-conv-id', type: 'championSelect' },
      ]),
    };
    const session = {
      chatDetails: {
        chatRoomName: 'room-12345@champ-select.na1.pvp.net',
      },
    };

    const id = await resolveChampSelectConversationId(lcu, session);
    expect(lcu.get).toHaveBeenCalledWith(CONVERSATIONS_ROUTE);
    expect(id).toBe('champ-select-conv-id');
  });

  it('queries /lol-chat/v1/conversations when direct ID is missing and finds championSelect type', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 'cs-conv-999', type: 'championSelect' },
      ]),
    };

    const id = await resolveChampSelectConversationId(lcu, {});
    expect(lcu.get).toHaveBeenCalledWith(CONVERSATIONS_ROUTE);
    expect(id).toBe('cs-conv-999');
  });

  it('matches conversation by name or stripped id when type is not explicitly championSelect', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 'other-id', name: 'room-jid-name', type: 'custom' },
      ]),
    };
    const session = {
      chatDetails: {
        chatRoomName: 'room-jid-name@champ-select.na1.pvp.net',
      },
    };

    const id = await resolveChampSelectConversationId(lcu, session);
    expect(id).toBe('other-id');
  });

  it('falls back to direct room JID when conversations query returns no match', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 'unrelated', type: 'custom' },
      ]),
    };
    const session = {
      chatDetails: {
        chatRoomName: 'room-jid@champ-select.na1.pvp.net',
      },
    };

    const id = await resolveChampSelectConversationId(lcu, session);
    expect(id).toBe('room-jid@champ-select.na1.pvp.net');
  });

  it('falls back to direct room JID when LCU get throws', async () => {
    const lcu = {
      get: vi.fn().mockRejectedValue(new Error('LCU error')),
    };
    const session = {
      chatDetails: {
        chatRoomName: 'room-jid@champ-select.na1.pvp.net',
      },
    };

    const id = await resolveChampSelectConversationId(lcu, session);
    expect(id).toBe('room-jid@champ-select.na1.pvp.net');
  });

  it('returns null when no session details and no LCU conversations found', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([]),
    };

    const id = await resolveChampSelectConversationId(lcu, null);
    expect(id).toBeNull();
  });

  it('returns null when lcu and session are both null', async () => {
    const id = await resolveChampSelectConversationId(null, null);
    expect(id).toBeNull();
  });
});

describe('sendChampSelectMessage', () => {
  it('returns error when message is empty or whitespace only', async () => {
    const lcu = { post: vi.fn() };
    const session = { chatDetails: { chatRoomName: 'room-123' } };

    expect(await sendChampSelectMessage(lcu, session, '')).toEqual({
      success: false,
      error: 'Empty message',
    });
    expect(await sendChampSelectMessage(lcu, session, '   ')).toEqual({
      success: false,
      error: 'Empty message',
    });
    expect(await sendChampSelectMessage(lcu, session, null)).toEqual({
      success: false,
      error: 'Empty message',
    });
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('returns error when lcu is missing or has no post method', async () => {
    const session = { chatDetails: { chatRoomName: 'room-123' } };
    expect(await sendChampSelectMessage(null, session, 'hello')).toEqual({
      success: false,
      error: 'LCU unavailable',
    });
    expect(await sendChampSelectMessage({}, session, 'hello')).toEqual({
      success: false,
      error: 'LCU unavailable',
    });
  });

  it('returns error when conversation id cannot be resolved', async () => {
    const lcu = { get: vi.fn().mockResolvedValue([]), post: vi.fn() };
    const res = await sendChampSelectMessage(lcu, null, 'hello team');
    expect(res).toEqual({
      success: false,
      error: 'Conversation not found',
    });
    expect(lcu.post).not.toHaveBeenCalled();
  });

  it('sends message via POST to the resolved conversation endpoint and returns success', async () => {
    const lcu = {
      post: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    };
    const session = {
      chatDetails: {
        chatRoomName: 'cs-room-42',
      },
    };

    const res = await sendChampSelectMessage(lcu, session, '  gl hf everyone!  ');
    expect(res).toEqual({
      success: true,
      conversationId: 'cs-room-42',
    });
    expect(lcu.post).toHaveBeenCalledWith('/lol-chat/v1/conversations/cs-room-42/messages', {
      body: 'gl hf everyone!',
      type: 'chat',
    });
  });

  it('handles LCU post failure response with ok: false', async () => {
    const lcu = {
      post: vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }),
    };
    const session = {
      chatDetails: {
        chatRoomName: 'cs-room-42',
      },
    };

    const res = await sendChampSelectMessage(lcu, session, 'hello');
    expect(res).toEqual({
      success: false,
      conversationId: 'cs-room-42',
      error: 'Forbidden',
    });
  });

  it('handles LCU post exception gracefully without crashing', async () => {
    const lcu = {
      post: vi.fn().mockRejectedValue(new Error('Network error')),
    };
    const session = {
      chatDetails: {
        chatRoomName: 'cs-room-42',
      },
    };

    const res = await sendChampSelectMessage(lcu, session, 'hello');
    expect(res).toEqual({
      success: false,
      conversationId: 'cs-room-42',
      error: 'Network error',
    });
  });
});
