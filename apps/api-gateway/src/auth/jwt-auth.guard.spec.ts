import { describe, it, expect, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';

vi.mock('@nestjs/passport', () => ({
  AuthGuard: vi.fn().mockImplementation(() =>
    class {
      canActivate(_ctx: unknown) {
        return Promise.resolve(true);
      }
    },
  ),
}));

import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  it('can be instantiated without throwing', () => {
    expect(() => new JwtAuthGuard()).not.toThrow();
  });

  it('delegates to super.canActivate() and returns a resolved boolean', async () => {
    const guard = new JwtAuthGuard();
    const mockCtx = {} as ExecutionContext;

    const result = await guard.canActivate(mockCtx);

    expect(result).toBe(true);
  });
});
