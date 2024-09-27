import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { Batch } from './batch.entity';
import { CategorizationService } from './categorization.service';
import { OpenAIBatchProcessor } from './openai-batch-processor.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { CategorizationCron } from './categorization.cron';
import { ConfigModule, ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Batch]), ConfigModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    CategorizationService,
    CategorizationCron,
    {
      provide: 'BatchProcessor',
      useClass: OpenAIBatchProcessor,
    },
    {
      provide: OpenAI,
      useFactory: (configService: ConfigService) => {
        return new OpenAI({
          apiKey: configService.get<string>('OPENAI_API_KEY'),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
