import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CategorizationService } from './categorization.service';

@Injectable()
export class CategorizationCron {
  private readonly logger = new Logger(CategorizationCron.name);

  constructor(private categorizationService: CategorizationService) {
    this.logger.log('CategorizationCron initialized');
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async requestCategorization() {
    try {
      await this.categorizationService.requestCategorization();
    } catch (error) {
      this.logger.error('Error in requestCategorization', error.stack);
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async updateCategories() {
    try {
      await this.categorizationService.updateCategories();
    } catch (error) {
      this.logger.error('Error in updateCategories', error.stack);
    }
  }
}
