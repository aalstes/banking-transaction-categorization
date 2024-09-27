import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Transaction } from './transaction.entity';
import { BatchStatus } from './batch-status.enum';

@Entity()
export class Batch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: BatchStatus,
    default: BatchStatus.CREATED,
  })
  status: BatchStatus;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;

  @OneToMany(() => Transaction, (transaction) => transaction.batch, {
    cascade: true,
  })
  transactions: Transaction[];

  @Column({ type: 'text', nullable: true })
  externalBatchId: string;

  @Column({ type: 'text', nullable: true })
  externalBatchStatus: string;

  @Column({ type: 'text', nullable: true })
  outputFileId: string;
}
