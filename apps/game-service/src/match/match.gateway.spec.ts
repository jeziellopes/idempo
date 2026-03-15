import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Server, Socket } from 'socket.io';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { MatchGateway } from './match.gateway.js';
import type { MatchRepository } from './match.repository.js';

const mockMatch = { id: 'match-1', status: 'ACTIVE', startedAt: new Date() };
const mockPlayers = [
  { playerId: 'p1', username: 'Alice', hp: 100, score: 10, resources: 5, positionX: 1, positionY: 2, alive: true, isBot: false },
];

function makeRepo(overrides: Partial<MatchRepository> = {}): MatchRepository {
  return {
    findMatch: vi.fn().mockResolvedValue(mockMatch),
    getPlayers: vi.fn().mockResolvedValue(mockPlayers),
    ...overrides,
  } as unknown as MatchRepository;
}

describe('MatchGateway', () => {
  let gateway: MatchGateway;
  let mockEmit: ReturnType<typeof vi.fn>;
  let mockTo: ReturnType<typeof vi.fn>;
  let mockClient: Pick<Socket, 'id' | 'join' | 'leave' | 'emit'>;
  let repo: MatchRepository;

  beforeEach(() => {
    repo = makeRepo();
    gateway = new MatchGateway(repo);

    mockEmit = vi.fn();
    mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
    gateway.server = { to: mockTo } as unknown as Server;

    mockClient = {
      id: 'socket-123',
      join: vi.fn().mockResolvedValue(undefined),
      leave: vi.fn().mockResolvedValue(undefined),
      emit: vi.fn(),
    };
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

    it('merges lastEvent into the payload when provided', () => {
      const payload = { players: [] };
      const lastEvent = { type: 'attack', correlationId: 'corr-1', eventId: 'evt-1' };

      gateway.broadcastMatchState('match-1', payload, lastEvent);

      expect(mockEmit).toHaveBeenCalledWith('match:state', { ...payload, lastEvent });
    });

    it('is a no-op when server is not yet initialised', () => {
      (gateway as unknown as { server: undefined }).server = undefined;

      expect(() => gateway.broadcastMatchState('match-1', {})).not.toThrow();
      expect(mockTo).not.toHaveBeenCalled();
    });
  });

  // ── handleJoinRoom ────────────────────────────────────────────────────────────

  describe('handleJoinRoom()', () => {
    it('adds the client to the match room', async () => {
      await gateway.handleJoinRoom({ matchId: 'match-1' }, mockClient as Socket);

      expect(mockClient.join).toHaveBeenCalledWith('match-1');
    });

    it('emits match:synced with current state to the joining client', async () => {
      await gateway.handleJoinRoom({ matchId: 'match-1' }, mockClient as Socket);

      expect(mockClient.emit).toHaveBeenCalledWith('match:state', expect.objectContaining({
        event: 'match:synced',
        status: 'ACTIVE',
        players: expect.arrayContaining([expect.objectContaining({ playerId: 'p1' })]),
      }));
    });

    it('silently skips sync if match not found', async () => {
      repo = makeRepo({ findMatch: vi.fn().mockResolvedValue(null) });
      gateway = new MatchGateway(repo);
      gateway.server = { to: mockTo } as unknown as Server;

      await expect(gateway.handleJoinRoom({ matchId: 'unknown' }, mockClient as Socket))
        .resolves.not.toThrow();
      expect(mockClient.emit).not.toHaveBeenCalled();
    });
  });

  // ── handleLeaveRoom ───────────────────────────────────────────────────────────

  describe('handleLeaveRoom()', () => {
    it('removes the client from the match room', () => {
      gateway.handleLeaveRoom({ matchId: 'match-1' }, mockClient as Socket);

      expect(mockClient.leave).toHaveBeenCalledWith('match-1');
    });
  });

  // ── spectator handlers ───────────────────────────────────────────────────────

  describe('handleSpectatorJoin()', () => {
    it('adds the client to the match room', async () => {
      await gateway.handleSpectatorJoin({ matchId: 'match-1' }, mockClient as Socket);

      expect(mockClient.join).toHaveBeenCalledWith('match-1');
    });

    it('emits match:synced to the spectator client', async () => {
      await gateway.handleSpectatorJoin({ matchId: 'match-1' }, mockClient as Socket);

      expect(mockClient.emit).toHaveBeenCalledWith('match:state', expect.objectContaining({
        event: 'match:synced',
        status: 'ACTIVE',
      }));
    });
  });

  describe('handleSpectatorLeave()', () => {
    it('removes the client from the match room', () => {
      gateway.handleSpectatorLeave({ matchId: 'match-1' }, mockClient as Socket);

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
