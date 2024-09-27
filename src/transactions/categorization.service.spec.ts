import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategorizationService } from './categorization.service';
import { Transaction } from './transaction.entity';
import { Batch } from './batch.entity';
import { BatchProcessor } from './batch-processor.interface';
import { TransactionCategory } from './transaction-category.enum';
import { BatchStatus } from './batch-status.enum';

describe('CategorizationService', () => {
  let service: CategorizationService;
  let transactionRepository: Repository<Transaction>;
  let batchRepository: Repository<Batch>;
  let batchProcessor: jest.Mocked<BatchProcessor>;

  beforeEach(async () => {
    const mockBatchProcessor = {
      submitBatch: jest.fn(),
      retrieveBatchStatus: jest.fn(),
      retrieveResults: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategorizationService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Batch),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: 'BatchProcessor',
          useValue: mockBatchProcessor,
        },
      ],
    }).compile();

    service = module.get<CategorizationService>(CategorizationService);
    transactionRepository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    batchRepository = module.get<Repository<Batch>>(getRepositoryToken(Batch));
    batchProcessor = module.get('BatchProcessor');
  });

  describe('requestCategorization', () => {
    it('should process pending transactions', async () => {
      const mockTransactions = [
        { id: 1, category: TransactionCategory.PENDING },
        { id: 2, category: TransactionCategory.PENDING },
      ];

      (
        transactionRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue(mockTransactions);

      await service.requestCategorization();

      expect(batchProcessor.submitBatch).toHaveBeenCalledWith(mockTransactions);
    });

    it('should not process when no pending transactions', async () => {
      (
        transactionRepository.createQueryBuilder().getMany as jest.Mock
      ).mockResolvedValue([]);

      await service.requestCategorization();

      expect(batchProcessor.submitBatch).not.toHaveBeenCalled();
    });
  });

  describe('updateCategories', () => {
    it('should update completed batches', async () => {
      const mockBatch = {
        id: '1',
        status: BatchStatus.CREATED,
        transactions: [
          { transactionId: '1', category: TransactionCategory.PENDING },
          { transactionId: '2' , category: TransactionCategory.PENDING },
        ],
      };

      (batchRepository.find as jest.Mock).mockResolvedValue([mockBatch]);
      batchProcessor.retrieveBatchStatus.mockResolvedValue('completed');
      batchProcessor.retrieveResults.mockResolvedValue({
        '1': TransactionCategory.GROCERIES,
        '2': TransactionCategory.UTILITIES,
      });

      await service.updateCategories();

      expect(batchRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BatchStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      );
      expect(mockBatch.transactions[0].category).toBe(
        TransactionCategory.GROCERIES,
      );
      expect(mockBatch.transactions[1].category).toBe(
        TransactionCategory.UTILITIES,
      );
    });

    it('should handle failed batches', async () => {
      const mockBatch = {
        id: '1',
        status: BatchStatus.CREATED,
        transactions: [],
      };

      (batchRepository.find as jest.Mock).mockResolvedValue([mockBatch]);
      batchProcessor.retrieveBatchStatus.mockResolvedValue('failed');

      await service.updateCategories();

      expect(batchRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BatchStatus.FAILED,
        }),
      );
    });

    it('should do nothing when no pending batches', async () => {
      (batchRepository.find as jest.Mock).mockResolvedValue([]);

      await service.updateCategories();

      expect(batchProcessor.retrieveBatchStatus).not.toHaveBeenCalled();
      expect(batchRepository.save).not.toHaveBeenCalled();
    });
  });
});
