import { Transaction } from './transaction.entity';
import { Batch } from './batch.entity';

export interface BatchProcessor {
  /**
   * Submits a batch of transactions for processing and returns a batch ID.
   * @param transactions An array of transactions to be processed.
   * @returns A Promise that resolves to a string representing the batch ID (filename).
   */
  submitBatch(transactions: Transaction[]): Promise<Batch>;

  /**
   * Retrieves the status of a batch based on its batch ID.
   * @param batchId The batch ID (filename) to check.
   * @returns A Promise that resolves to the current status of the batch.
   */
  retrieveBatchStatus(batchId: string): Promise<string>;

  /**
   * Retrieves the categorization results for a completed batch.
   * @param batchId The batch ID to retrieve results for.
   * @returns A Promise that resolves to an object mapping transaction IDs to their categorization results.
   */
  retrieveResults(batchId: string): Promise<Record<number, string>>;
}
