import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import {
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { BatchStatus } from './batch-status.enum';
import { TransactionCategory } from './transaction-category.enum';
import { Transaction } from './transaction.entity';
import { TransactionType } from './transaction-type.enum';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: TransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [
        {
          provide: TransactionsService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            processCSV: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
    service = module.get<TransactionsService>(TransactionsService);
  });

  describe('findAll', () => {
    it('should return paginated transactions', async () => {
      const result: { items: Transaction[], total: number, page: number, limit: number} = {
        items: [
          {
            transactionId: '1',
            amount: 100,
            description: 'Test',
            transactionType: TransactionType.DEBIT,
            category: TransactionCategory.PENDING,
            batch: {
              id: '1',
              status: BatchStatus.COMPLETED,
              createdAt: new Date(),
              completedAt: new Date(),
              externalBatchId: 'externalId',
              externalBatchStatus: 'externalStatus',
              outputFileId: 'outputFileId',
              transactions: [],
            },
            batchId: '1',
            timestamp: new Date(),
            accountNumber: 'TestAccount',
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      };
      jest.spyOn(service, 'findAll').mockResolvedValue({
        items: result.items.map((item) => ({
          ...item,
          category: 'TestCategory' as TransactionCategory, // Assuming 'TestCategory' is a valid TransactionCategory
          batch: {
            ...item.batch,
            externalBatchId: 'externalId',
            externalBatchStatus: 'externalStatus',
            outputFileId: 'outputFileId',
          },
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });

      const response = await controller.findAll(1, 10);
      expect(response).toEqual({
        items: result.items.map((item) => ({
          ...item,
          category: 'TestCategory', // Assuming 'TestCategory' is a valid TransactionCategory
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
      expect(service.findAll).toHaveBeenCalledWith(1, 10);
    });

    it('should throw InternalServerErrorException on error', async () => {
      jest
        .spyOn(service, 'findAll')
        .mockRejectedValue(new Error('Database error'));

      await expect(controller.findAll(1, 10)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should handle empty result set', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      const response = await controller.findAll(1, 10);
      expect(response).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
      });
    });
  });

  describe('findOne', () => {
    it('should return a single transaction', async () => {
      const mockTransaction: Transaction = {
        transactionId: '1',
        amount: 100,
        description: 'Test',
        transactionType: TransactionType.DEBIT,
        category: TransactionCategory.GROCERIES,
        batch: {
          id: '1',
          status: BatchStatus.COMPLETED,
          createdAt: new Date(),
          completedAt: new Date(),
          externalBatchId: 'externalId',
          externalBatchStatus: 'externalStatus',
          outputFileId: 'outputFileId',
          transactions: [],
        },
        batchId: '1',
        timestamp: new Date(),
        accountNumber: 'TestAccount',
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(mockTransaction);

      const result = await controller.findOne('1');
      expect(result).toEqual(mockTransaction);
      expect(service.findOne).toHaveBeenCalledWith('1');
    });

    it('should throw NotFoundException when transaction is not found', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('999')).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException on unexpected errors', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockRejectedValue(new Error('Unexpected error'));

      await expect(controller.findOne('1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('uploadFile', () => {
    it('should process CSV file successfully', async () => {
      const mockFile = {
        buffer: Buffer.from('id,amount,description\n1,100,Test'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File;

      const mockResult = { processed: 1, failed: 0 };
      jest.spyOn(service, 'processCSV').mockResolvedValue(mockResult);

      const result = await controller.uploadFile(mockFile);
      expect(result).toEqual({
        message: 'CSV file processed',
        result: mockResult,
      });
      expect(service.processCSV).toHaveBeenCalledWith(
        mockFile.buffer.toString(),
      );
    });

    it('should throw BadRequestException when CSV processing fails', async () => {
      const mockFile = {
        buffer: Buffer.from('invalid,csv,content'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File;

      jest
        .spyOn(service, 'processCSV')
        .mockRejectedValue(new BadRequestException('Invalid CSV'));

      await expect(controller.uploadFile(mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw InternalServerErrorException on unexpected errors', async () => {
      const mockFile = {
        buffer: Buffer.from('id,amount,description\n1,100,Test'),
        originalname: 'test.csv',
        mimetype: 'text/csv',
      } as Express.Multer.File;

      jest
        .spyOn(service, 'processCSV')
        .mockRejectedValue(new Error('Unexpected error'));

      await expect(controller.uploadFile(mockFile)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
