import type { CanonicalImportService } from '../imports/canonical-import.service';
import type { StoredIngestionImporter } from '../ingestions/stored-ingestion.importer';
import type { AcademicExamsImportService } from '../imports/academic-exams-import.service';
import { BadRequestException } from '@nestjs/common';
import type { AcademicImportService } from '../imports/academic-import.service';
import { ConnectorRegistryService } from './connector-registry.service';

describe('ConnectorRegistryService', () => {
  const importer = { run: jest.fn() } as unknown as AcademicImportService;
  const registry = new ConnectorRegistryService(
    importer,
    importer as unknown as AcademicExamsImportService,
    importer as unknown as StoredIngestionImporter,
    importer as unknown as CanonicalImportService,
  );

  it('selects the assignment importer from the captured connector and collection', () => {
    expect(registry.get('academic.assignments', 'assignments')).toBe(importer);
  });

  it.each([
    ['academic.unknown', 'exams'],
    ['academic.assignments', 'exams'],
    ['toString', 'assignments'],
  ])(
    'rejects unsupported or mismatched snapshots: %s / %s',
    (name, collection) => {
      expect(() => registry.get(name, collection)).toThrow(BadRequestException);
    },
  );
});
