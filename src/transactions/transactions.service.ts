import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { TransactionCategory } from './transaction-category.enum';
import { parse } from 'papaparse';
import { TransactionType } from './transaction-type.enum';

interface CSVTransaction {
  transaction_id: string;
  amount: string;
  timestamp: string;
  description: string;
  transaction_type: string;
  account_number: string;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
  ) {}

  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    items: Transaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [items, total] = await this.transactionsRepository.findAndCount({
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Transaction> {
    const transaction = await this.transactionsRepository.findOne({
      where: { transactionId: id },
    });
    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }
    return transaction;
  }

  async processCSV(
    fileContent: string,
  ): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    const parseResult = parse<CSVTransaction>(fileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) =>
        header.trim().toLowerCase().replace(/\s+/g, '_'),
    });

    if (parseResult.errors.length > 0) {
      throw new BadRequestException(
        'Error parsing CSV: ' + parseResult.errors[0].message,
      );
    }

    // Check if the CSV is empty or doesn't have the expected structure
    if (parseResult.data.length === 0 || !this.isValidCSVStructure(parseResult.data[0])) {
      throw new BadRequestException('Invalid CSV structure');
    }

    for (const record of parseResult.data) {
      try {
        const transaction = this.transactionsRepository.create({
          transactionId: record.transaction_id,
          amount: this.parseAmount(record.amount),
          timestamp: this.parseTimestamp(record.timestamp),
          description: record.description,
          transactionType: this.parseType(record.transaction_type),
          accountNumber: record.account_number,
          category: TransactionCategory.PENDING,
        });

        await this.transactionsRepository.save(transaction);
        processed++;
      } catch (err) {
        this.logger.error('Error processing record:', { error: err, record });
        failed++;
      }
    }

    return { processed, failed };
  }

  private parseTimestamp(dateString: string): Date {
    return new Date(dateString);
  }

  private parseAmount(amountString: string): number {
    const amount = parseFloat(amountString);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${amountString}`);
    }
    return amount;
  }

  private parseType(transactionTypeString: string): TransactionType {
    if (Object.values(TransactionType).includes(transactionTypeString as TransactionType)) {
      return transactionTypeString as TransactionType;
    }
    throw new Error(`Invalid transaction type: ${transactionTypeString}`);
  }

  private isValidCSVStructure(record: CSVTransaction): boolean {
    const requiredFields = ['transaction_id', 'amount', 'timestamp', 'description', 'transaction_type', 'account_number'];
    return requiredFields.every(field => field in record);
  }
}
