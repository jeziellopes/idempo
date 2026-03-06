import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  METRICS_PORT: Joi.number().integer().min(1).max(65535).default(9091),

  JWT_SECRET: Joi.string().min(16).required(),

  CORS_ORIGIN: Joi.string().uri().default('http://localhost:3000'),

  // Downstream service URLs — required for ProxyModule routing
  // Port assignments: gateway=3001 game=3002 combat=3003 wallet=3004
  //   leaderboard=3005 inventory=3006 reward=3007 marketplace=3008 notification=3009 identity=3010
  GAME_SERVICE_URL: Joi.string().uri().default('http://localhost:3002'),
  WALLET_SERVICE_URL: Joi.string().uri().default('http://localhost:3004'),
  INVENTORY_SERVICE_URL: Joi.string().uri().default('http://localhost:3006'),
  MARKETPLACE_SERVICE_URL: Joi.string().uri().default('http://localhost:3008'),
  LEADERBOARD_SERVICE_URL: Joi.string().uri().default('http://localhost:3005'),
  NOTIFICATION_SERVICE_URL: Joi.string().uri().default('http://localhost:3009'),
  IDENTITY_SERVICE_URL: Joi.string().uri().default('http://localhost:3010'),
});
