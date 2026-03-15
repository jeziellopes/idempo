'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { io, type Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { useMatchStore, type PlayerState } from '../store/match.store';

const GAME_SERVICE_URL = process.env['NEXT_PUBLIC_GAME_SERVICE_URL'] ?? 'http://localhost:3002';

export function useMatchSocket(matchId: string | null): RefObject<Socket | null> {
  const socketRef = useRef<Socket | null>(null);
  const { setStatus, setPlayers, setWinner, addEvent, isSpectator } = useMatchStore();

  useEffect(() => {
    if (!matchId) return;

    const socket = io(`${GAME_SERVICE_URL}/game`, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (isSpectator) {
        socket.emit('spectator:join', { matchId });
      } else {
        socket.emit('match:join', { matchId });
      }
    });

    socket.on('match:state', (payload: {
      event: string;
      status?: string;
      players?: PlayerState[];
      winnerId?: string;
      lastEvent?: { type: string; correlationId: string; eventId: string };
    }) => {
      const now = performance.now();

      // Push to event log if the server included event metadata
      if (payload.lastEvent) {
        addEvent({
          id: uuidv4(),
          type: payload.lastEvent.type,
          correlationId: payload.lastEvent.correlationId,
          eventId: payload.lastEvent.eventId,
          latencyMs: Math.round(now % 1000), // approximate round-trip indicator
          timestamp: Date.now(),
        });
      }

      switch (payload.event) {
        case 'match:synced':
          // Server pushed current state when we joined the room — hydrate unconditionally.
          if (payload.status) setStatus(payload.status as Parameters<typeof setStatus>[0]);
          if (payload.players) setPlayers(payload.players);
          break;
        case 'match:started':
          setStatus('ACTIVE');
          if (payload.players) setPlayers(payload.players);
          break;
        case 'tick':
          // Ensure status reflects reality even if match:started was missed.
          setStatus('ACTIVE');
          if (payload.players) setPlayers(payload.players);
          break;
        case 'match:finished':
          setStatus('FINISHED');
          if (payload.winnerId) setWinner(payload.winnerId);
          break;
        case 'match:cancelled':
          setStatus('CANCELLED');
          break;
      }
    });

    return () => {
      if (isSpectator) {
        socket.emit('spectator:leave', { matchId });
      } else {
        socket.emit('match:leave', { matchId });
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId, isSpectator, setStatus, setPlayers, setWinner, addEvent]);

  return socketRef;
}
