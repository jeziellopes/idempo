import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MatchRepository } from '../match/match.repository.js';
import { type MatchPlayer, SPAWN_POSITIONS, MAX_PLAYERS } from '../match/match.types.js';
import { decideBotAction, DEFAULT_TILE_MAP, type TileType } from './bot.strategy.js';
import { getLogger } from '@idempo/observability';
import { MatchService } from '../match/match.service.js';

const logger = getLogger('game-service:bot');

const BOT_NAMES = [
  '⚡ Alpha', '🔥 Beta', '🌀 Gamma', '💀 Delta', '🤖 Epsilon', '👾 Zeta',
];

@Injectable()
export class BotService {
  constructor(
    private readonly repo: MatchRepository,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
  ) {}

  /**
   * Fills empty lobby slots with bots up to `targetCount` total players.
   * Returns the UUIDs of the created bots.
   */
  async fillWithBots(matchId: string, currentCount: number, targetCount: number): Promise<string[]> {
    const added: string[] = [];
    for (let i = currentCount; i < targetCount; i++) {
      const botId = uuidv4();
      const botName = BOT_NAMES[i % BOT_NAMES.length] ?? `🤖 Bot ${i + 1}`;
      const playerIndex = i + 1;
      const idx = Math.min(playerIndex, MAX_PLAYERS);
      const spawns = SPAWN_POSITIONS[idx] ?? SPAWN_POSITIONS[MAX_PLAYERS]!;
      const spawn = spawns[playerIndex - 1] ?? spawns[0]!;

      await this.repo.addPlayer(matchId, botId, botName, spawn.x, spawn.y, true);
      added.push(botId);
      logger.info({ matchId, botId, botName }, 'Bot added to match');
    }
    return added;
  }

  /**
   * Runs one action per alive bot in the match.
   * Each action goes through the full `matchService.submitAction` path so it
   * traverses Kafka and appears in the distributed-systems HUD.
   */
  async tickBots(matchId: string, players: MatchPlayer[]): Promise<void> {
    const bots = players.filter((p) => p.isBot && p.alive);
    const tiles: TileType[][] = DEFAULT_TILE_MAP;

    await Promise.all(
      bots.map(async (bot) => {
        try {
          const decision = decideBotAction(bot, players, tiles);
          const actionId = uuidv4();
          await this.matchService.submitAction(matchId, bot.playerId, {
            actionId,
            actionType: decision.actionType,
            payload: decision.payload,
            useStamp: false,
          });
        } catch (err) {
          // Bot action failures are non-critical — log and continue
          logger.warn({ matchId, botId: bot.playerId, err }, 'Bot action failed');
        }
      }),
    );
  }
}
