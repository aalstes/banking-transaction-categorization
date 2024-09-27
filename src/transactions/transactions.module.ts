import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), ConfigModule],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
