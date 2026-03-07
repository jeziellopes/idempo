import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3010),

  // GitHub OAuth Application credentials
  // Register at https://github.com/settings/developers
  // Callback URL: <host>/api/auth/github/callback
  // Optional in development/test — the /auth/test-token bypass works without them.
  // Required in production.
  GITHUB_CLIENT_ID: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().optional().default(''),
  }),
  GITHUB_CLIENT_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().optional().default(''),
  }),

  // JWT signing secrets — must be ≥16 chars
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),

  // PostgreSQL connection string for identity_db
  IDENTITY_DB_URL: Joi.string().uri({ scheme: 'postgres' }).required(),

  // After OAuth callback success, the user is redirected here
  WEB_REDIRECT_URL: Joi.string().uri().default('http://localhost:3000'),

  OTLP_ENDPOINT: Joi.string().uri().optional(),
});
