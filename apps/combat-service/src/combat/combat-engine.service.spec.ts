import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@idempo/observability', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { CombatEngineService } from './combat-engine.service.js';

const BASE_CTX = {
  actionId: 'action-1',
  matchId: 'match-1',
  attackerId: 'player-a',
  targetId: 'player-b',
  correlationId: 'corr-1',
  causationId: 'cause-1',
};

describe('CombatEngineService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves a normal attack (damage=20, isCritical=false) when random >= CRIT_CHANCE', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // >= 0.1 → not crit
    const svc = new CombatEngineService();

    const result = svc.resolve(BASE_CTX);

    expect(result.damage).toBe(20);
    expect(result.isCritical).toBe(false);
    expect(result.event.type).toBe('PlayerAttackedEvent');
    expect(result.event.damage).toBe(20);
    expect(result.event.eventId).toBe('action-1');
    expect(result.event.actionId).toBe('action-1');
    expect(result.event.playerId).toBe('player-a');
    expect(result.event.targetId).toBe('player-b');
    expect(result.event.matchId).toBe('match-1');
    expect(result.event.correlationId).toBe('corr-1');
    expect(result.event.causationId).toBe('cause-1');
    expect(result.event.version).toBe(1);
    expect(typeof result.event.timestamp).toBe('string');
  });

  it('resolves a critical hit (damage=40, isCritical=true) when random < CRIT_CHANCE', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // < 0.1 → crit
    const svc = new CombatEngineService();

    const result = svc.resolve({ ...BASE_CTX, actionId: 'action-crit' });

    expect(result.damage).toBe(40);
    expect(result.isCritical).toBe(true);
    expect(result.event.damage).toBe(40);
  });

  it('treats random === CRIT_CHANCE (0.1) as non-crit (boundary: must be strictly < 0.1)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // NOT strictly < 0.1
    const svc = new CombatEngineService();

    const result = svc.resolve(BASE_CTX);

    expect(result.isCritical).toBe(false);
    expect(result.damage).toBe(20);
  });

  it('emits correct event shape for each unique context', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const svc = new CombatEngineService();
    const ctx = {
      actionId: 'a-99',
      matchId: 'm-99',
      attackerId: 'attacker-99',
      targetId: 'target-99',
      correlationId: 'corr-99',
      causationId: 'cause-99',
    };

    const result = svc.resolve(ctx);

    expect(result.event.eventId).toBe('a-99');
    expect(result.event.matchId).toBe('m-99');
    expect(result.event.playerId).toBe('attacker-99');
    expect(result.event.targetId).toBe('target-99');
  });
});
