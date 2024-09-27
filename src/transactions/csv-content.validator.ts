import { FileValidator } from '@nestjs/common';

export class CsvContentValidator extends FileValidator<
  Record<string, any>,
  Express.Multer.File
> {
  constructor(protected validationOptions: Record<string, any>) {
    super(validationOptions);
  }

  isValid(file?: Express.Multer.File): boolean | Promise<boolean> {
    if (!file) return false;

    const content = file.buffer.toString();
    const lines = content.split('\n');
    if (lines.length < 2) return false; // At least header and one data row

    const header = lines[0].toLowerCase().split(',');

    const requiredColumns = [
      'transaction id',
      'amount',
      'timestamp',
      'description',
      'transaction type',
      'account number',
    ];

    const hasAllRequiredColumns = requiredColumns.every((col) =>
      header.includes(col),
    );

    return hasAllRequiredColumns;
  }

  buildErrorMessage(file: Express.Multer.File): string {
    return 'Invalid CSV content: must include Transaction ID, Amount, Timestamp, Description, Transaction Type and Account Number columns';
  }
}
