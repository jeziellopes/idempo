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

  broadcastMatchState(matchId: string, payload: Record<string, unknown>): void {
    // server may be undefined if no WebSocket adapter is attached (e.g. in test environments)
    if (!this.server) return;
    this.server.to(matchId).emit('match:state', payload);
  }
}
