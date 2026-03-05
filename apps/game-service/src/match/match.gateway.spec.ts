import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server, Socket } from 'socket.io';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { MatchGateway } from './match.gateway.js';

describe('MatchGateway', () => {
  let gateway: MatchGateway;
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockTo: ReturnType<typeof vi.fn>;
  let mockClient: Pick<Socket, 'id' | 'join' | 'leave'>;

  beforeEach(() => {
    gateway = new MatchGateway();

    mockEmit = vi.fn();
    mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    gateway.server = { to: mockTo } as unknown as Server;

    mockClient = { id: 'socket-123', join: vi.fn().mockResolvedValue(undefined), leave: vi.fn().mockResolvedValue(undefined) };
  });

  // ── broadcastMatchState ───────────────────────────────────────────────────────

  describe('broadcastMatchState()', () => {
    it('emits "match:state" to the correct room with the provided payload', () => {
      const payload = { event: 'tick', players: [] };

      gateway.broadcastMatchState('match-1', payload);

      expect(mockTo).toHaveBeenCalledWith('match-1');
      expect(mockEmit).toHaveBeenCalledWith('match:state', payload);
    });

    it('scopes the broadcast to the specific matchId room', () => {
      gateway.broadcastMatchState('room-abc', { event: 'match:finished' });

      expect(mockTo).toHaveBeenCalledWith('room-abc');
      expect(mockTo).not.toHaveBeenCalledWith('match-1');
    });
  });

  // ── handleJoinRoom ────────────────────────────────────────────────────────────

  describe('handleJoinRoom()', () => {
    it('adds the client to the match room', () => {
      gateway.handleJoinRoom({ matchId: 'match-1' }, mockClient as Socket);

      expect(mockClient.join).toHaveBeenCalledWith('match-1');
    });
  });

  // ── handleLeaveRoom ───────────────────────────────────────────────────────────

  describe('handleLeaveRoom()', () => {
    it('removes the client from the match room', () => {
      gateway.handleLeaveRoom({ matchId: 'match-1' }, mockClient as Socket);

      expect(mockClient.leave).toHaveBeenCalledWith('match-1');
    });
  });

  // ── lifecycle ────────────────────────────────────────────────────────────────

  describe('handleConnection() / handleDisconnect()', () => {
    it('completes without error on connection', () => {
      expect(() => gateway.handleConnection(mockClient as Socket)).not.toThrow();
    });

    it('completes without error on disconnection', () => {
      expect(() => gateway.handleDisconnect(mockClient as Socket)).not.toThrow();
    });
  });
});
