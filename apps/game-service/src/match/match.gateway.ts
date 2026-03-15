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
import type { Server, Socket } from 'socket.io';
import { getLogger } from '@idempo/observability';

const logger = getLogger('game-service:ws');

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/game' })
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    logger.info({ clientId: client.id }, 'WebSocket client connected');
  }

  handleDisconnect(client: Socket): void {
    logger.info({ clientId: client.id }, 'WebSocket client disconnected');
  }

  @SubscribeMessage('match:join')
  handleJoinRoom(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    void client.join(data.matchId);
    logger.info({ clientId: client.id, matchId: data.matchId }, 'Client joined match room');
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
  handleSpectatorJoin(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    void client.join(data.matchId);
    logger.info({ clientId: client.id, matchId: data.matchId }, 'Spectator joined match room');
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
}
