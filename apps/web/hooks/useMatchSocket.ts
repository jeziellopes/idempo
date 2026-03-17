'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { io, type Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { useMatchStore, type PlayerState } from '../store/match.store';

const DEFAULT_GAME_SERVICE_URL = 'http://localhost:3002';

/** Normalise a player payload coming from the WebSocket (DB shape) or HTTP snapshot.
 *  DB rows use `positionX`/`positionY`; the store / API types use `position: {x, y}`.
 */
function normalizePlayer(p: Record<string, unknown>): PlayerState {
  const pos = p['position'] as { x: number; y: number } | undefined;
  const x = pos?.x ?? (p['positionX'] as number | undefined) ?? 0;
  const y = pos?.y ?? (p['positionY'] as number | undefined) ?? 0;
  return {
    playerId: p['playerId'] as string,
    username: p['username'] as string,
    hp: p['hp'] as number,
    score: p['score'] as number,
    resources: p['resources'] as number,
    alive: p['alive'] as boolean,
    isBot: p['isBot'] as boolean | undefined,
    position: { x, y },
  };
}

export function useMatchSocket(matchId: string | null): RefObject<Socket | null> {
  const socketRef = useRef<Socket | null>(null);
  const { setStatus, setPlayers, setWinner, addEvent, isSpectator } = useMatchStore();
  const [gameServiceUrl, setGameServiceUrl] = useState<string>(DEFAULT_GAME_SERVICE_URL);

  // Fetch runtime config once so the WebSocket URL is correct even for ngrok / external access.
  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg: { gameServiceUrl?: string }) => {
        if (cfg.gameServiceUrl) setGameServiceUrl(cfg.gameServiceUrl);
      })
      .catch(() => { /* keep default */ });
  }, []);

  useEffect(() => {
    if (!matchId) return;

    const socket = io(`${gameServiceUrl}/game`, {
      transports: ['websocket', 'polling'],
    });
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
      players?: Record<string, unknown>[];
      winnerId?: string;
      lastEvent?: { type: string; correlationId: string; eventId: string };
    }) => {
      const now = performance.now();

      if (payload.lastEvent) {
        addEvent({
          id: uuidv4(),
          type: payload.lastEvent.type,
          correlationId: payload.lastEvent.correlationId,
          eventId: payload.lastEvent.eventId,
          latencyMs: Math.round(now % 1000),
          timestamp: Date.now(),
        });
      }

      const normalizePlayers = (players?: Record<string, unknown>[]) =>
        players ? players.map(normalizePlayer) : undefined;

      switch (payload.event) {
        case 'match:synced':
          if (payload.status) setStatus(payload.status as Parameters<typeof setStatus>[0]);
          if (payload.players) setPlayers(normalizePlayers(payload.players)!);
          break;
        case 'match:started':
          setStatus('ACTIVE');
          if (payload.players) setPlayers(normalizePlayers(payload.players)!);
          break;
        case 'tick':
          setStatus('ACTIVE');
          if (payload.players) setPlayers(normalizePlayers(payload.players)!);
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
  }, [matchId, gameServiceUrl, isSpectator, setStatus, setPlayers, setWinner, addEvent]);

  return socketRef;
}

