import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { Batch } from './batch.entity';
import { BatchProcessor } from './batch-processor.interface';
import { BatchStatus } from './batch-status.enum';
import { TransactionCategory } from './transaction-category.enum';

@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Batch)
    private batchRepository: Repository<Batch>,
    @Inject('BatchProcessor')
    private batchProcessor: BatchProcessor,
  ) {}

  async requestCategorization(): Promise<void> {
    const batchSize = 100;
    const queryBuilder = this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.category = :category', {
        category: TransactionCategory.PENDING,
      })
      .andWhere('transaction.batchId IS NULL')
      .take(batchSize);

    const pendingTransactions = await queryBuilder.getMany();

    if (pendingTransactions.length > 0) {
      await this.batchProcessor.submitBatch(pendingTransactions);
    }

    const processed = pendingTransactions.length;
    if (processed > 0) {
      this.logger.log(
        `Requested categorization for ${processed} transactions.`,
      );
    } else {
      this.logger.debug('No pending transactions found for categorization.');
    }
  }

  async updateCategories(): Promise<void> {
    const batchSize = 100;
    let processed = 0;

    const pendingBatches = await this.batchRepository.find({
      where: { status: BatchStatus.CREATED },
      take: batchSize,
      relations: ['transactions'],
    });

    if (pendingBatches.length === 0) {
      return;
    }

    for (const batch of pendingBatches) {
      const status = await this.batchProcessor.retrieveBatchStatus(batch.id);

      if (status === 'completed') {
        const results = await this.batchProcessor.retrieveResults(batch.id);
        for (const transaction of batch.transactions) {
          const categoryString = results[transaction.transactionId];
          transaction.category = categoryString as TransactionCategory;
        }

        batch.status = BatchStatus.COMPLETED;
        batch.completedAt = new Date(Date.now());
      } else if (
        ['failed', 'expired', 'cancelling', 'cancelled'].includes(status)
      ) {
        batch.status = BatchStatus.FAILED;
      }

      await this.batchRepository.save(batch);
    }

    processed += pendingBatches.length;
    this.logger.log(`Updated statuses for ${processed} batches`);
  }
}
