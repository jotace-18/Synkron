import { Module } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RuleProcessorService } from './rule-processor.service';

@Module({
  providers: [DatabaseService, RuleProcessorService],
  exports: [RuleProcessorService],
})
export class RuleProcessingModule {}
