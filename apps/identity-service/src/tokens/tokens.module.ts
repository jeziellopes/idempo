import { Module } from '@nestjs/common';
import { TokenService } from './token.service.js';

@Module({
  providers: [TokenService],
  exports: [TokenService],
})
export class TokensModule {}
