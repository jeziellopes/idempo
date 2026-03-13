import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller.js';
import { AuthProxyController } from './auth-proxy.controller.js';
import { ProxyFactory } from './proxy.factory.js';

@Module({
  providers: [ProxyFactory],
  controllers: [ProxyController, AuthProxyController],
})
export class ProxyModule {}
