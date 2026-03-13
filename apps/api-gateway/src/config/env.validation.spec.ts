import { describe, it, expect } from 'vitest';
import { envValidationSchema } from './env.validation.js';

const VALID_SECRET = 'at-least-16-chars-long!!';

describe('envValidationSchema', () => {
  it('accepts a minimal valid config (only JWT_SECRET required)', () => {
    const { error } = envValidationSchema.validate({ JWT_SECRET: VALID_SECRET });

    expect(error).toBeUndefined();
  });

  it('rejects when JWT_SECRET is missing', () => {
    const { error } = envValidationSchema.validate({});

    expect(error).toBeDefined();
    expect(error?.message).toContain('JWT_SECRET');
  });

  it('rejects JWT_SECRET shorter than 16 characters', () => {
    const { error } = envValidationSchema.validate({ JWT_SECRET: 'tooshort' });

    expect(error).toBeDefined();
  });

  it('applies sensible defaults for optional fields', () => {
    const { value } = envValidationSchema.validate({ JWT_SECRET: VALID_SECRET });

    expect(value.PORT).toBe(3001);
    expect(value.NODE_ENV).toBe('development');
    expect(value.IDENTITY_SERVICE_URL).toBe('http://localhost:3010');
  });

  it('rejects an invalid NODE_ENV value', () => {
    const { error } = envValidationSchema.validate({
      JWT_SECRET: VALID_SECRET,
      NODE_ENV: 'staging',
    });

    expect(error).toBeDefined();
  });

  it('accepts all three valid NODE_ENV values', () => {
    for (const env of ['development', 'production', 'test']) {
      const { error } = envValidationSchema.validate({ JWT_SECRET: VALID_SECRET, NODE_ENV: env });
      expect(error).toBeUndefined();
    }
  });
});
