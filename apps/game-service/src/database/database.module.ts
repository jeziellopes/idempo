import { Module, Global } from '@nestjs/common';
import pg from 'pg';

export const DATABASE_POOL = 'DATABASE_POOL';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      useFactory: (): pg.Pool => {
        const pool = new pg.Pool({
          host: process.env['DB_HOST'] ?? 'localhost',
          port: Number(process.env['DB_PORT'] ?? 5432),
          database: process.env['DB_NAME'] ?? 'game_db',
          user: process.env['DB_USER'] ?? 'idempo',
          password: process.env['DB_PASS'] ?? 'idempo',
          max: 10,
        });
        return pool;
      },
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
