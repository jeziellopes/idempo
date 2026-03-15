import type {
  OnGatewayConnection,
  OnGatewayDisconnect} from '@nestjs/websockets';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { getLogger } from '@idempo/observability';
import { MatchRepository } from './match.repository.js';

const logger = getLogger('game-service:ws');

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/game' })
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly repo: MatchRepository) {}

  handleConnection(client: Socket): void {
    logger.info({ clientId: client.id }, 'WebSocket client connected');
  }

  handleDisconnect(client: Socket): void {
    logger.info({ clientId: client.id }, 'WebSocket client disconnected');
  }

  @SubscribeMessage('match:join')
  async handleJoinRoom(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await client.join(data.matchId);
    logger.info({ clientId: client.id, matchId: data.matchId }, 'Client joined match room');
    await this._syncClientState(client, data.matchId);
  }

  @SubscribeMessage('match:leave')
  handleLeaveRoom(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    void client.leave(data.matchId);
  }

  /**
   * Spectators join the same Socket.IO room as players — they receive all
   * `match:state` broadcasts read-only, without a player record in the DB.
   */
  @SubscribeMessage('spectator:join')
  async handleSpectatorJoin(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    await client.join(data.matchId);
    logger.info({ clientId: client.id, matchId: data.matchId }, 'Spectator joined match room');
    await this._syncClientState(client, data.matchId);
  }

  @SubscribeMessage('spectator:leave')
  handleSpectatorLeave(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    void client.leave(data.matchId);
  }

  /**
   * Broadcast match state to all clients (players + spectators) in the room.
   * `lastEvent` carries minimal metadata for the distributed-systems HUD:
   *   { type, correlationId, eventId }
   */
  broadcastMatchState(
    matchId: string,
    payload: Record<string, unknown>,
    lastEvent?: { type: string; correlationId: string; eventId: string },
  ): void {
    if (!this.server) return;
    this.server.to(matchId).emit('match:state', lastEvent ? { ...payload, lastEvent } : payload);
  }

  /**
   * Push current match state to a single client that just joined a room.
   * This ensures the client is in sync even if it missed earlier broadcasts
   * (e.g. match:started). Silently no-ops if the match doesn't exist.
   */
  private async _syncClientState(client: Socket, matchId: string): Promise<void> {
    try {
      const match = await this.repo.findMatch(matchId);
      if (!match) return;
      const players = await this.repo.getPlayers(matchId);
      client.emit('match:state', {
        event: 'match:synced',
        status: match.status,
        players: players.map((p) => ({
          playerId: p.playerId,
          username: p.username,
          hp: p.hp,
          score: p.score,
          resources: p.resources,
          position: { x: p.positionX, y: p.positionY },
          alive: p.alive,
          isBot: p.isBot,
        })),
      });
    } catch (err) {
      logger.warn({ clientId: client.id, matchId, err }, 'Failed to sync client state on join');
    }
  }
}
