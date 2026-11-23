ALTER TABLE sync.definitions
 DROP CONSTRAINT definitions_connector_valid,
 DROP CONSTRAINT definitions_collection_valid,
 ADD CONSTRAINT definitions_connector_collection_valid CHECK (
   (connector = 'academic.assignments' AND source_collection = 'assignments') OR
   (connector = 'academic.exams' AND source_collection = 'exams')
 );
ALTER TABLE sync.runs
 DROP CONSTRAINT runs_source_snapshot_valid,
 ADD CONSTRAINT runs_source_snapshot_valid CHECK (
   (source_connection_id IS NULL AND connector IS NULL AND source_collection IS NULL) OR
   (source_connection_id IS NOT NULL AND connector IS NOT NULL AND source_collection IS NOT NULL AND (
     (connector = 'academic.assignments' AND source_collection = 'assignments') OR
     (connector = 'academic.exams' AND source_collection = 'exams')
   ))
 );
