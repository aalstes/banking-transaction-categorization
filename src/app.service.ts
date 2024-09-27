import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    const apiDocsUrl = '/api-docs';
    return `
      <h1>Welcome to the Transactions API!</h1>
      <p>This API provides endpoints for managing transactions.</p>
      <p>For detailed API documentation, please visit our <a href="${apiDocsUrl}">Swagger Documentation</a>.</p>
    `;
  }
}
