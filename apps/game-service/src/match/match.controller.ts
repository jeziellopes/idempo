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
} from '@nestjs/common';
import { MatchService } from './match.service.js';
import { type SubmitActionDto } from './match.service.js';
import type { ActionType } from './match.types.js';

interface CreateMatchBody {
  username: string;
  playerId: string;
}

interface JoinMatchBody {
  username: string;
  playerId: string;
}

interface ActionBody {
  playerId: string;
  actionType: ActionType;
  payload?: Record<string, unknown>;
  useStamp?: boolean;
}

@Controller('matches')
export class MatchController {
  constructor(private readonly matchService: MatchService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createMatch(@Body() body: CreateMatchBody) {
    return this.matchService.createOrJoinMatch(body.playerId, body.username);
  }

  @Post(':matchId/join')
  joinMatch(@Param('matchId') matchId: string, @Body() body: JoinMatchBody) {
    return this.matchService.joinMatch(matchId, body.playerId, body.username);
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
    @Headers('x-idempotency-key') idempotencyKey?: string,
  ) {
    const actionId = idempotencyKey;
    if (!actionId) {
      throw new BadRequestException('X-Idempotency-Key header is required');
    }

    const dto: SubmitActionDto = {
      actionId,
      actionType: body.actionType,
      payload: body.payload ?? {},
      useStamp: body.useStamp,
    };

    return this.matchService.submitAction(matchId, body.playerId, dto);
  }
}
