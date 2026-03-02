import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  METRICS_PORT: Joi.number().integer().min(1).max(65535).default(9091),

  JWT_SECRET: Joi.string().min(16).required(),
  DEMO_PASSWORD: Joi.string().default('idempo'),

  CORS_ORIGIN: Joi.string().uri().default('http://localhost:3000'),

  // Downstream service URLs — required for ProxyModule routing
  GAME_SERVICE_URL: Joi.string().uri().default('http://localhost:3002'),
  WALLET_SERVICE_URL: Joi.string().uri().default('http://localhost:3003'),
  INVENTORY_SERVICE_URL: Joi.string().uri().default('http://localhost:3004'),
  MARKETPLACE_SERVICE_URL: Joi.string().uri().default('http://localhost:3005'),
  LEADERBOARD_SERVICE_URL: Joi.string().uri().default('http://localhost:3006'),
  NOTIFICATION_SERVICE_URL: Joi.string().uri().default('http://localhost:3007'),
});
