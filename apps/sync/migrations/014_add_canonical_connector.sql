ALTER TABLE sync.definitions
 DROP CONSTRAINT definitions_connector_collection_valid,
 ADD CONSTRAINT definitions_connector_collection_valid CHECK (
   (source_mode = 'pull' AND (
     (connector = 'academic.assignments' AND source_collection = 'assignments') OR
     (connector = 'academic.exams' AND source_collection = 'exams') OR
     (connector = 'standard.activities' AND source_collection = 'activities')
   )) OR
   (source_mode = 'push' AND connector = 'standard.ingestion' AND btrim(source_collection) <> '')
 );
ALTER TABLE sync.runs
 DROP CONSTRAINT runs_source_snapshot_valid,
 ADD CONSTRAINT runs_source_snapshot_valid CHECK (
   (source_connection_id IS NULL AND connector IS NULL AND source_collection IS NULL) OR
   (source_connection_id IS NOT NULL AND connector IS NOT NULL AND source_collection IS NOT NULL AND (
     (connector = 'academic.assignments' AND source_collection = 'assignments') OR
     (connector = 'academic.exams' AND source_collection = 'exams') OR
     (connector = 'standard.activities' AND source_collection = 'activities') OR
     (connector = 'standard.ingestion' AND btrim(source_collection) <> '')
   ))
 );
