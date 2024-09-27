import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { OpenAIBatchProcessor } from './openai-batch-processor.service';
import { Batch } from './batch.entity';
import { Transaction } from './transaction.entity';
import { BatchStatus } from './batch-status.enum';
import { TransactionCategory } from './transaction-category.enum';
import OpenAI from 'openai';

describe('OpenAIBatchProcessor', () => {
  let service: OpenAIBatchProcessor;
  let mockBatchRepository: jest.Mocked<Repository<Batch>>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(async () => {
    mockBatchRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn(),
    } as any;

    const mockFileContents = `
    {"custom_id":"transaction-1","response":{"body":{"choices":[{"message":{"content":"GROCERIES"}}]}}}
    {"custom_id":"transaction-2","response":{"body":{"choices":[{"message":{"content":"UTILITIES"}}]}}}
  `;

    mockOpenAI = {
      files: {
        create: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ id: 'file-1' })),
        content: jest.fn().mockResolvedValue({
          text: async () => mockFileContents,
        } as any),
      },
      batches: {
        create: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ id: 'external-batch-1' }),
          ),
        retrieve: jest.fn().mockResolvedValue({
          status: 'completed',
          output_file_id: 'output-file-1',
        }),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIBatchProcessor,
        {
          provide: getRepositoryToken(Batch),
          useValue: mockBatchRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: OpenAI,
          useValue: mockOpenAI,
        },
      ],
    }).compile();

    service = module.get<OpenAIBatchProcessor>(OpenAIBatchProcessor);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('submitBatch', () => {
    it('should create a batch and return it with external ID', async () => {
      const transactions = [
        { transactionId: '1', description: 'Test transaction 1' },
        { transactionId: '2', description: 'Test transaction 2' },
      ] as Transaction[];

      const mockBatch = {
        id: 'batch-1',
        status: BatchStatus.CREATED,
        createdAt: new Date(),
        completedAt: null,
        transactions: [],
        externalBatchId: null,
        externalBatchStatus: null,
        outputFileId: null,
      } as Batch;
      mockBatchRepository.create.mockReturnValue(mockBatch);
      mockBatchRepository.save.mockResolvedValue(mockBatch);

      const result = await service.submitBatch(transactions);

      expect(result).toEqual({
        ...mockBatch,
        externalBatchId: 'external-batch-1',
      });
      expect(mockBatchRepository.create).toHaveBeenCalledWith({
        status: BatchStatus.CREATED,
        transactions: transactions,
      });
      expect(mockBatchRepository.save).toHaveBeenCalledTimes(2);
      expect(mockOpenAI.files.create).toHaveBeenCalled();
      expect(mockOpenAI.batches.create).toHaveBeenCalledWith({
        input_file_id: 'file-1',
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
      });
    });
  });

  describe('retrieveBatchStatus', () => {
    it('should retrieve and update batch status', async () => {
      const mockBatch = {
        id: 'batch-1',
        externalBatchId: 'external-batch-1',
        status: BatchStatus.CREATED,
        createdAt: new Date(),
        completedAt: null,
        transactions: [],
        externalBatchStatus: null,
        outputFileId: null,
      } as Batch;
      mockBatchRepository.findOne.mockResolvedValue(mockBatch);

      const result = await service.retrieveBatchStatus('batch-1');

      expect(result).toBe('completed');
      expect(mockBatchRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
      });
      expect(mockOpenAI.batches.retrieve).toHaveBeenCalledWith(
        'external-batch-1',
      );
      expect(mockBatchRepository.save).toHaveBeenCalledWith({
        ...mockBatch,
        externalBatchStatus: 'completed',
        outputFileId: 'output-file-1',
      });
    });

    it('should throw an error if batch is not found', async () => {
      mockBatchRepository.findOne.mockResolvedValue(null);

      await expect(
        service.retrieveBatchStatus('non-existent-batch'),
      ).rejects.toThrow(
        'Batch non-existent-batch not found or has no external ID',
      );
    });
  });

  describe('retrieveResults', () => {
    it('should retrieve and process batch results', async () => {
      const mockBatch = {
        id: 'batch-1',
        outputFileId: 'output-file-1',
        transactions: [{ transactionId: '1' }, { transactionId: '2' }],
        status: BatchStatus.COMPLETED,
        createdAt: new Date(),
        completedAt: new Date(),
        externalBatchId: 'external-1',
        externalBatchStatus: 'completed',
      } as Batch;
      mockBatchRepository.findOne.mockResolvedValue(mockBatch);

      const result = await service.retrieveResults('batch-1');

      expect(result).toEqual({
        1: TransactionCategory.GROCERIES,
        2: TransactionCategory.UTILITIES,
      });
      expect(mockBatchRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        relations: ['transactions'],
      });
      expect(mockOpenAI.files.content).toHaveBeenCalledWith('output-file-1');
    });

    it('should throw an error if batch is not found', async () => {
      mockBatchRepository.findOne.mockResolvedValue(null);

      await expect(
        service.retrieveResults('non-existent-batch'),
      ).rejects.toThrow('Batch with ID non-existent-batch not found');
    });

    it('should throw an error if batch has no output file ID', async () => {
      const mockBatch = {
        id: 'batch-1',
        outputFileId: null,
        status: BatchStatus.COMPLETED,
        createdAt: new Date(),
        completedAt: new Date(),
        transactions: [],
        externalBatchId: 'external-1',
        externalBatchStatus: 'completed',
      } as Batch;
      mockBatchRepository.findOne.mockResolvedValue(mockBatch);

      await expect(service.retrieveResults('batch-1')).rejects.toThrow(
        'Batch batch-1 has no output file ID',
      );
    });
  });
});
