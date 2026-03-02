'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useMatchStore, type PlayerState } from '../store/match.store.js';

const GAME_SERVICE_URL = process.env['NEXT_PUBLIC_GAME_SERVICE_URL'] ?? 'http://localhost:3002';

export function useMatchSocket(matchId: string | null): RefObject<Socket | null> {
  const socketRef = useRef<Socket | null>(null);
  const { setStatus, setPlayers, setWinner } = useMatchStore();

  useEffect(() => {
    if (!matchId) return;

    const socket = io(`${GAME_SERVICE_URL}/game`, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('match:join', { matchId });
    });

    socket.on('match:state', (payload: {
      event: string;
      players?: PlayerState[];
      winnerId?: string;
    }) => {
      switch (payload.event) {
        case 'match:started':
          setStatus('ACTIVE');
          if (payload.players) setPlayers(payload.players);
          break;
        case 'tick':
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
      socket.emit('match:leave', { matchId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [matchId, setStatus, setPlayers, setWinner]);

  return socketRef;
}
