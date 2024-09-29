import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { BatchProcessor } from './batch-processor.interface';
import { Transaction } from './transaction.entity';
import { Batch } from './batch.entity';
import { BatchStatus } from './batch-status.enum';
import { ConfigService } from '@nestjs/config';
import { File } from 'buffer';
import { TransactionCategory } from './transaction-category.enum';

interface BatchRequest {
  custom_id: string;
  method: string;
  url: string;
  body: {
    model: string;
    messages: Array<{
      role: 'system' | 'user';
      content: string;
    }>;
    max_tokens: number;
  };
}

interface BatchResponseLine {
  id: string;
  custom_id: string;
  response: {
    status_code: number;
    request_id: string;
    body: {
      id: string;
      object: string;
      created: number;
      model: string;
      choices: Array<{
        index: number;
        message: {
          role: string;
          content: string;
        };
        logprobs: null;
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      system_fingerprint: string;
    };
    error: null | any;
  };
}

@Injectable()
export class OpenAIBatchProcessor implements BatchProcessor {
  private readonly logger = new Logger(OpenAIBatchProcessor.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(Batch)
    private batchRepository: Repository<Batch>,
    private openai: OpenAI,
  ) {}

  async submitBatch(transactions: Transaction[]): Promise<Batch> {
    const batch = this.batchRepository.create({
      status: BatchStatus.CREATED,
      transactions: transactions,
    });
    await this.batchRepository.save(batch);

    const batchRequests = this.createBatchRequests(transactions);
    const batchFileId = await this.uploadBatchInput(batchRequests);
    const externalBatchId = await this.createBatch(batchFileId);

    // Update the batch with the external ID
    batch.externalBatchId = externalBatchId;
    await this.batchRepository.save(batch);

    this.logger.log(
      `Submitted batch ${batch.id} with external ID ${externalBatchId}`,
    );
    return batch;
  }

  async retrieveBatchStatus(batchId: string): Promise<string> {
    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
    });
    if (!batch || !batch.externalBatchId) {
      throw new Error(`Batch ${batchId} not found or has no external ID`);
    }

    try {
      const externalBatch = await this.openai.batches.retrieve(
        batch.externalBatchId,
      );
      this.logger.log(`Status: ${externalBatch.status}. ${JSON.stringify(externalBatch.request_counts)}`);
      const externalBatchStatusString = externalBatch.status.toString();

      batch.externalBatchStatus = externalBatchStatusString;
      batch.outputFileId = externalBatch.output_file_id || null;
      await this.batchRepository.save(batch);

      return externalBatchStatusString;
    } catch (error) {
      this.logger.error(`Error retrieving batch status for ${batchId}:`, error);
      throw error;
    }
  }

  async retrieveResults(
    batchId: string,
  ): Promise<Record<number, TransactionCategory>> {
    this.logger.log(`Retrieving results for batch ${batchId}`);

    const batch = await this.batchRepository.findOne({
      where: { id: batchId },
      relations: ['transactions'],
    });

    if (!batch) {
      this.logger.error(`Batch with ID ${batchId} not found`);
      throw new Error(`Batch with ID ${batchId} not found`);
    }

    if (!batch.outputFileId) {
      this.logger.error(`Batch ${batchId} has no output file ID`);
      throw new Error(`Batch ${batchId} has no output file ID`);
    }

    const fileResponse = await this.openai.files.content(batch.outputFileId);
    const fileContents = await fileResponse.text();

    const batchResponses: BatchResponseLine[] = fileContents
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as BatchResponseLine);

    this.logger.debug(
      batchResponses.map(
        (r) => `${r.custom_id}: ${r.response.body.choices[0].message.content}`,
      ),
    );

    const results: Record<number, TransactionCategory> = {};

    batch.transactions.forEach((transaction) => {
      const response = batchResponses.find(
        (br) => br.custom_id === `transaction-${transaction.transactionId}`,
      );
      if (
        response &&
        response.response.body.choices &&
        response.response.body.choices.length > 0
      ) {
        const suggestedCategory =
          response.response.body.choices[0].message.content.trim();

        // Validate and enforce the use of predefined categories
        const validCategory = Object.values(TransactionCategory).find(
          (cat) =>
            cat.toLowerCase() === suggestedCategory.toLowerCase() &&
            cat !== TransactionCategory.PENDING,
        );

        results[transaction.transactionId] =
          validCategory || TransactionCategory.MISCELLANEOUS;
      } else {
        results[transaction.transactionId] = TransactionCategory.MISCELLANEOUS;
      }
    });

    return results;
  }

  private createBatchRequests(transactions: Transaction[]): BatchRequest[] {
    const categories = Object.values(TransactionCategory).filter(
      (cat) => cat !== TransactionCategory.PENDING,
    );
    const categoriesString = categories.join(', ');

    return transactions.map((transaction) => ({
      custom_id: `transaction-${transaction.transactionId}`,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant that categorizes financial transactions. Use only the following categories: ${categoriesString}. If a transaction doesn't clearly fit into any of these categories, use '${TransactionCategory.MISCELLANEOUS}'.`,
          },
          {
            role: 'user',
            content: `Please categorize this transaction into one of the predefined categories. The transaction description is: "${transaction.description}". The transaction type is ${transaction.transactionType} and the amount is ${transaction.amount}. Respond with only the category name, nothing else.`,
          },
        ],
        max_tokens: 20,
      },
    }));
  }

  private async uploadBatchInput(
    batchRequests: BatchRequest[],
  ): Promise<string> {
    const jsonlContent = batchRequests
      .map((request) => JSON.stringify(request))
      .join('\n');
    const buffer = Buffer.from(jsonlContent, 'utf-8');
    const file = new File([buffer], 'batch_input.jsonl', {
      type: 'application/jsonl',
    });

    try {
      const uploadedFile = await this.openai.files.create({
        file,
        purpose: 'batch',
      });

      this.logger.log(`Uploaded batch input file with ID: ${uploadedFile.id}`);
      return uploadedFile.id;
    } catch (error) {
      this.logger.error('Error uploading batch input file:', error);
      throw error;
    }
  }

  private async createBatch(fileId: string): Promise<string> {
    const batch = await this.openai.batches.create({
      input_file_id: fileId,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    });

    return batch.id;
  }
}
