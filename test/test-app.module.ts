import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../src/transactions/transaction.entity';
import { Batch } from '../src/transactions/batch.entity';
import { OpenAIBatchProcessor } from '../src/transactions/openai-batch-processor.service';
import { CategorizationService } from '../src/transactions/categorization.service';
import OpenAI from 'openai';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          OPENAI_API_KEY: 'mock-api-key',
        }),
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_NAME'),
        entities: [Transaction, Batch],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Transaction, Batch]),
  ],
  providers: [
    OpenAIBatchProcessor,
    CategorizationService,
    {
      provide: OpenAI,
      useFactory: (configService: ConfigService) => {
        return new OpenAI({
          apiKey: configService.get<string>('OPENAI_API_KEY'),
        });
      },
      inject: [ConfigService],
    },
    {
      provide: 'BatchProcessor',
      useExisting: OpenAIBatchProcessor,
    },
  ],
  exports: [TypeOrmModule],
})
export class TestAppModule {}
