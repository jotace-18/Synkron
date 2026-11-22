import { Injectable } from '@nestjs/common';
import { ConnectionTargetPolicyService } from '../../connections/connection-target-policy.service';
import { AcademicSourceReader } from './academic-reader.service';
import type { AcademicExamSource } from './exam-source.types';
import { parseAcademicExam } from './exam-source.validator';
@Injectable()
export class AcademicExamsReaderService extends AcademicSourceReader<AcademicExamSource> {
  constructor(targets: ConnectionTargetPolicyService) {
    super(targets, parseAcademicExam, 'exámenes');
  }
}
