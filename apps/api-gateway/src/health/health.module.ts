import { Controller, Get, Module } from '@nestjs/common';
import type { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { TerminusModule, HealthCheck } from '@nestjs/terminus';

@Controller()
class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get('health')
  @HealthCheck()
  check() {
    // Heap must stay under 512 MB — basic liveness signal
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }
}

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
