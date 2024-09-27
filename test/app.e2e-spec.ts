import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import {
  StartedPostgreSqlContainer,
  PostgreSqlContainer,
} from '@testcontainers/postgresql';
import { TestAppModule } from './test-app.module';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from './../src/transactions/transaction.entity';
import { Batch } from './../src/transactions/batch.entity';
import { BatchStatus } from './../src/transactions/batch-status.enum';
import { TransactionCategory } from './../src/transactions/transaction-category.enum';
import { CategorizationService } from './../src/transactions/categorization.service';
import * as nock from 'nock';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionType } from './../src/transactions/transaction-type.enum';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let postgresContainer: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let transactionRepository: Repository<Transaction>;
  let batchRepository: Repository<Batch>;
  let categorizationService: CategorizationService;

  beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer().start();

    process.env.DB_HOST = postgresContainer.getHost();
    process.env.DB_PORT = postgresContainer.getPort().toString();
    process.env.DB_USERNAME = postgresContainer.getUsername();
    process.env.DB_PASSWORD = postgresContainer.getPassword();
    process.env.DB_NAME = postgresContainer.getDatabase();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get the DataSource from the application context
    dataSource = app.get(DataSource);

    // Synchronize the test database
    await dataSource.synchronize(true);

    transactionRepository = moduleFixture.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
    batchRepository = moduleFixture.get<Repository<Batch>>(
      getRepositoryToken(Batch),
    );
    categorizationService = moduleFixture.get<CategorizationService>(
      CategorizationService,
    );

    // Mock OpenAI API endpoints
    nock('https://api.openai.com')
      // Mock file upload
      .post('/v1/files')
      .reply(200, {
        id: 'file-mock-id',
        object: 'file',
        purpose: 'batch',
      })
      // Mock batch creation
      .post('/v1/batches')
      .reply(200, {
        id: 'batch-mock-id',
        object: 'batch',
        status: 'pending',
      })
      // Mock batch retrieval
      .get('/v1/batches/batch-mock-id')
      .reply(200, {
        id: 'batch-mock-id',
        object: 'batch',
        status: 'completed',
        output_file_id: 'output-file-mock-id',
        request_counts: { succeeded: 2, failed: 0 },
      })
      // Mock file content retrieval
      .get('/v1/files/output-file-mock-id/content')
      .reply(
        200,
        `
        {"custom_id":"transaction-1","response":{"body":{"choices":[{"message":{"content":"${TransactionCategory.GROCERIES}"}}]}}}
        {"custom_id":"transaction-2","response":{"body":{"choices":[{"message":{"content":"${TransactionCategory.UTILITIES}"}}]}}}
      `,
      );
  }, 90000); // 90 seconds timeout for this hook

  afterAll(async () => {
    await app.close();
    await postgresContainer.stop();
  });

  it('should categorize transactions and update batch status', async () => {
    // Step 1: Create a batch of transactions with 'Pending' category
    const transactions = [
      {
        transactionId: '1',
        timestamp: new Date(),
        amount: 100,
        accountNumber: 'TestAccount',
        transactionType: TransactionType.DEBIT,
        description: 'TestDescription',
        category: TransactionCategory.PENDING,
      },
      {
        transactionId: '2',
        timestamp: new Date(),
        amount: 200,
        accountNumber: 'TestAccount2',
        transactionType: TransactionType.CREDIT,
        description: 'TestDescription2',
        category: TransactionCategory.PENDING,
      },
    ];

    await transactionRepository.save(transactions);

    // Step 2: Trigger the categorization process
    await categorizationService.requestCategorization();

    // Step 3: Simulate the cron job that updates categories
    await categorizationService.updateCategories();

    // Step 4: Verify that the transactions have been categorized
    const categorizedTransactions = await transactionRepository.find();
    expect(
      categorizedTransactions.every(
        (t) => t.category !== TransactionCategory.PENDING,
      ),
    ).toBe(true);
    expect(categorizedTransactions[0].category).toBe(
      TransactionCategory.GROCERIES,
    );
    expect(categorizedTransactions[1].category).toBe(
      TransactionCategory.UTILITIES,
    );

    // Step 5: Check that the batch status is updated to 'Completed'
    const batches = await batchRepository.find();
    expect(batches.every((b) => b.status === BatchStatus.COMPLETED)).toBe(true);
  });
});
