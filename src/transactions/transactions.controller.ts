import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  InternalServerErrorException,
  Param,
  NotFoundException,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';
import { Transaction } from './transaction.entity';
import { Express } from 'express';
import { CsvContentValidator } from './csv-content.validator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);

  constructor(private readonly transactionsService: TransactionsService) {}

  @ApiOperation({ summary: 'Get all transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Return all transactions.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  @Get()
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<{
    items: Transaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      return await this.transactionsService.findAll(page, limit);
    } catch (error) {
      this.logger.error('Error fetching transactions:', error);

      // Throw an InternalServerErrorException, which results in a 500 status code
      throw new InternalServerErrorException(
        'An error occurred while fetching transactions',
      );
    }
  }

  @ApiOperation({ summary: 'Get a transaction by id' })
  @ApiParam({ name: 'id', type: 'string' })
  @ApiResponse({ status: 200, description: 'Return a transaction.' })
  @ApiResponse({ status: 404, description: 'Transaction not found.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Transaction> {
    try {
      return await this.transactionsService.findOne(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Re-throw NotFoundException to maintain the 404 status
        throw error;
      }
      this.logger.error(`Error fetching transaction with id ${id}:`, error);

      // Throw an InternalServerErrorException, which results in a 500 status code
      throw new InternalServerErrorException(
        'An error occurred while fetching the transaction',
      );
    }
  }

  @ApiOperation({ summary: 'Upload a CSV file of transactions' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'CSV file processed successfully.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiResponse({ status: 500, description: 'Internal server error.' })
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 }), // 1MB
          new FileTypeValidator({ fileType: 'text/csv' }),
          new CsvContentValidator({}),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const fileContent = file.buffer.toString();

    try {
      const result = await this.transactionsService.processCSV(fileContent);
      return { message: 'CSV file processed', result };
    } catch (error) {
      this.logger.error('Error processing CSV:', error);
      if (error instanceof BadRequestException) {
        throw error; // Re-throw BadRequestException
      }
      throw new InternalServerErrorException(
        'An error occurred while processing the CSV file',
      );
    }
  }
}
