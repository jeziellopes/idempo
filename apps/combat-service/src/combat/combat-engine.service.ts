import { Injectable } from '@nestjs/common';
import { getLogger } from '@idempo/observability';
import type { PlayerAttackedEvent } from '@idempo/contracts';

const logger = getLogger('combat-service:engine');

export interface AttackContext {
  actionId: string;
  matchId: string;
  attackerId: string;
  targetId: string;
  correlationId: string;
  causationId: string;
}

export interface AttackResult {
  damage: number;
  isCritical: boolean;
  event: PlayerAttackedEvent;
}

/** Base damage spec: 20 pts + optional weapon bonus (0–20). Critical: 10% chance → double. */
const BASE_DAMAGE = 20;
const CRIT_CHANCE = 0.1;

@Injectable()
export class CombatEngineService {
  resolve(ctx: AttackContext): AttackResult {
    const isCritical = Math.random() < CRIT_CHANCE;
    const baseDmg = BASE_DAMAGE;
    const damage = isCritical ? baseDmg * 2 : baseDmg;

    logger.debug({ ...ctx, damage, isCritical }, 'Combat resolved');

    const event: PlayerAttackedEvent = {
      eventId: ctx.actionId,
      correlationId: ctx.correlationId,
      causationId: ctx.causationId,
      version: 1,
      type: 'PlayerAttackedEvent',
      actionId: ctx.actionId,
      playerId: ctx.attackerId,
      targetId: ctx.targetId,
      matchId: ctx.matchId,
      damage,
      timestamp: new Date().toISOString(),
    };

    return { damage, isCritical, event };
  }
}
