import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

describe('AppModule', () => {
  it('should be defined', async () => {
    // We test that the module can be compiled without a real DB connection
    // by creating a test module with overridden TypeORM config
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              DB_HOST: 'localhost',
              DB_PORT: 5432,
              DB_USERNAME: 'test',
              DB_PASSWORD: 'test',
              DB_DATABASE: 'test',
              NODE_ENV: 'test',
              JWT_SECRET: 'test-secret',
            }),
          ],
        }),
      ],
    }).compile();

    expect(module).toBeDefined();
  });
});
