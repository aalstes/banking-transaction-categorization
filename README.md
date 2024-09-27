# Banking Transaction Categorization

Stores bank transactions in a postgres DB.
Classifies them using the OpenAI Batch API.

POST /transactions: Submit transactions CSV file

GET /transactions: Retrieve all categorized transactions, paged

GET /transactions/:id: Retrieve a specific transaction by ID

API docs at http://localhost:3000/api-docs

## To run

```sh
npm run start
```
go to http://localhost:3000/

Tests:
```sh
npm run test

# or with coverage
npm run test:cov

# e2e
npm run test:e2e
```

## Running with Docker Compose

To run the application using Docker Compose, follow these steps:

1. Ensure you have Docker and Docker Compose installed on your system.

2. Create a `.env` file in the project root with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. Build and start the containers:
   ```sh
   docker-compose up --build
   ```

4. The application will be available at http://localhost:3000

5. To stop the containers, use:
   ```sh
   docker-compose down
   ```

## Trade-offs and Design Decisions

1. Batch Processing:
   - We use a batch processing approach for categorization requests.
   - Trade-off: This improves efficiency and reduces API calls but introduces a delay in categorization.

2. Cron Job for Categorization:
   - Categorization requests are made via a cron job running every 10 seconds.
   - Trade-off: This balances near real-time categorization with system efficiency.

3. Separate Update Process:
   - Category updates are processed separately every 30 minutes.
   - Trade-off: This reduces API load but may lead to temporary inconsistencies in data.

4. Database Schema:
   - Transactions and Batches are stored in separate tables with a one-to-many relationship.
   - Decision: This allows for efficient querying and maintains data integrity.

5. Error Handling:
   - Failed categorizations are logged but don't stop the process.
   - Trade-off: This ensures robustness but may require manual intervention for persistent errors.

6. API Design:
   - RESTful API with pagination for transaction retrieval.
   - Decision: This provides a standard interface and handles large datasets efficiently.

7. Technology Stack:
   - NestJS with TypeORM for backend, PostgreSQL for database.
   - Decision: Offers strong typing, modularity, and robust ORM capabilities.

8. Asynchronous Processing:
   - File uploads and categorization are handled asynchronously.
   - Trade-off: Improves responsiveness but may complicate error handling and user feedback.

These design decisions aim to balance system performance, data consistency, and user experience while maintaining code maintainability and scalability.
