import { Entity, PrimaryColumn, Column, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Batch } from './batch.entity';
import { TransactionCategory } from './transaction-category.enum';
import { TransactionType } from './transaction-type.enum';

@Entity()
export class Transaction {
  @ApiProperty({ description: 'The unique identifier for the transaction' })
  @PrimaryColumn()
  transactionId: string;

  @ApiProperty({ description: 'The amount of the transaction' })
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @ApiProperty({ description: 'The timestamp of the transaction' })
  @Column({ type: 'date' })
  timestamp: Date;

  @ApiProperty({ description: 'The description of the transaction' })
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ description: 'The type of transaction' })
  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  transactionType: TransactionType;

  @ApiProperty({
    description: 'The account number associated with the transaction',
  })
  @Column({ type: 'text' })
  accountNumber: string;

  @ApiProperty({
    description: 'The category of the transaction',
    required: false,
  })
  @Column({
    type: 'enum',
    enum: TransactionCategory,
    default: TransactionCategory.PENDING,
  })
  category: TransactionCategory;

  @ManyToOne(() => Batch, (batch) => batch.transactions)
  batch: Batch;

  @Column({ type: 'text', nullable: true })
  batchId: string | null;
}
