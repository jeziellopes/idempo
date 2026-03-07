import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { MatchService } from './match.service.js';
import { type SubmitActionDto } from './match.service.js';
import type { ActionType } from './match.types.js';

/**
 * Identity (playerId + username) is injected by the API Gateway as
 * X-Player-Id / X-Username headers after JWT validation.
 * These headers are server-authoritative — the gateway strips any
 * client-supplied values and re-injects from the verified JWT payload.
 */
function extractIdentity(
  playerId: string | undefined,
  username: string | undefined,
): { playerId: string; username: string } {
  if (!playerId || !username) {
    throw new UnauthorizedException('Missing X-Player-Id or X-Username headers.');
  }
  return { playerId, username };
}

interface ActionBody {
  actionType: ActionType;
  payload?: Record<string, unknown>;
  useStamp?: boolean;
}

@Controller('matches')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createMatch(
    @Headers('x-player-id') playerId: string | undefined,
    @Headers('x-username') username: string | undefined,
  ) {
    const identity = extractIdentity(playerId, username);
    return this.matchService.createOrJoinMatch(identity.playerId, identity.username);
  }

  @Post(':matchId/join')
  joinMatch(
    @Param('matchId') matchId: string,
    @Headers('x-player-id') playerId: string | undefined,
    @Headers('x-username') username: string | undefined,
  ) {
    const identity = extractIdentity(playerId, username);
    return this.matchService.joinMatch(matchId, identity.playerId, identity.username);
  }

  @Get(':matchId')
  getMatch(@Param('matchId') matchId: string) {
    return this.matchService.getMatchState(matchId);
  }

  @Post(':matchId/actions')
  @HttpCode(HttpStatus.ACCEPTED)
  submitAction(
    @Param('matchId') matchId: string,
    @Body() body: ActionBody,
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-player-id') playerId: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }
    if (!playerId) {
      throw new UnauthorizedException('Missing X-Player-Id header.');
    }

    const dto: SubmitActionDto = {
      actionId: idempotencyKey,
      actionType: body.actionType,
      payload: body.payload ?? {},
      useStamp: body.useStamp,
    };

    return this.matchService.submitAction(matchId, playerId, dto);
  }
}
