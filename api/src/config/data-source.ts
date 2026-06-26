import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Variable de entorno requerida: ${key}`);
  }
  return value;
}

const isCompiled = __filename.endsWith('.js');

export default new DataSource({
  type: 'postgres',
  host: requireEnv('DB_HOST'),
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  username: requireEnv('DB_USERNAME'),
  password: process.env.DB_PASSWORD || '',
  database: requireEnv('DB_DATABASE'),
  entities: [isCompiled ? 'dist/**/*.entity.js' : 'src/**/*.entity{.ts,.js}'],
  migrations: [isCompiled ? 'dist/migrations/*.js' : 'src/migrations/*{.ts,.js}'],
  synchronize: false,
});
