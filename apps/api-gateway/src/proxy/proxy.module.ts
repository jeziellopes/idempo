import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller.js';
import { ProxyFactory } from './proxy.factory.js';

@Module({
  providers: [ProxyFactory],
  controllers: [ProxyController],
})
export class ProxyModule {}
