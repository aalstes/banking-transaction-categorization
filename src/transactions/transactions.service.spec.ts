import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction } from './transaction.entity';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionCategory } from './transaction-category.enum';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: Repository<Transaction>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    repository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const mockTransactions = [
        { transactionId: '1' },
        { transactionId: '2' },
      ] as Transaction[];
      jest
        .spyOn(repository, 'findAndCount')
        .mockResolvedValue([mockTransactions, 2]);

      const result = await service.findAll(1, 10);

      expect(result).toEqual({
        items: mockTransactions,
        total: 2,
        page: 1,
        limit: 10,
      });
    });
  });

  describe('findOne', () => {
    it('should return a transaction if found', async () => {
      const mockTransaction = { transactionId: '1' } as Transaction;
      jest.spyOn(repository, 'findOne').mockResolvedValue(mockTransaction);

      const result = await service.findOne('1');

      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException if transaction not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('processCSV', () => {
    it('should process valid CSV content', async () => {
      const csvContent = `Transaction ID,Amount,Timestamp,Description,Transaction Type,Account Number
TXN00001,-87.18,2024-05-16 07:22:18.808433,Municipal Tax Payment,debit,NLINGB1944573686`;

      jest.spyOn(repository, 'create').mockReturnValue({} as Transaction);
      jest.spyOn(repository, 'save').mockResolvedValue({} as Transaction);

      const result = await service.processCSV(csvContent);

      expect(result).toEqual({ processed: 1, failed: 0 });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountNumber: 'NLINGB1944573686',
          amount: -87.18,
          category: 'Pending',
          description: 'Municipal Tax Payment',
          // timestamp: new Date('2024-05-16T05:22:18.808Z'),
          transactionId: 'TXN00001',
          transactionType: 'debit',
        }),
      );
    });

    it('should throw BadRequestException for invalid CSV', async () => {
      const invalidCSV = 'invalid,csv,content';

      await expect(service.processCSV(invalidCSV)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for empty CSV', async () => {
      const emptyCSV = '';

      await expect(service.processCSV(emptyCSV)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for CSV with missing required fields', async () => {
      const invalidCSV = 'date,amount\n2023-05-01,100.50';

      await expect(service.processCSV(invalidCSV)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
