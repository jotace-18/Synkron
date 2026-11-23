-- Existing connections and definitions remain polling sources by default.
ALTER TABLE sync.connections
 ADD COLUMN input_mode text NOT NULL DEFAULT 'pull',
 ALTER COLUMN base_url DROP NOT NULL,
 ADD CONSTRAINT connections_input_mode_valid CHECK (input_mode IN ('pull','push')),
 ADD CONSTRAINT connections_input_configuration_valid CHECK (
   (input_mode = 'pull' AND base_url IS NOT NULL) OR
   (input_mode = 'push' AND base_url IS NULL AND auth_type = 'none' AND credentials_encrypted IS NULL)
 ),
 ADD CONSTRAINT connections_tenant_id_id_mode_unique UNIQUE(tenant_id,id,input_mode);

ALTER TABLE sync.definitions
 ADD COLUMN source_mode text NOT NULL DEFAULT 'pull',
 DROP CONSTRAINT definitions_source_connection_fk,
 DROP CONSTRAINT definitions_connector_collection_valid,
 ADD CONSTRAINT definitions_source_connection_fk FOREIGN KEY(tenant_id,source_connection_id,source_mode)
   REFERENCES sync.connections(tenant_id,id,input_mode),
 ADD CONSTRAINT definitions_connector_collection_valid CHECK (
   (source_mode = 'pull' AND (
     (connector = 'academic.assignments' AND source_collection = 'assignments') OR
     (connector = 'academic.exams' AND source_collection = 'exams')
   )) OR
   (source_mode = 'push' AND connector = 'standard.ingestion' AND btrim(source_collection) <> '')
 ),
 ADD CONSTRAINT definitions_tenant_id_id_mode_unique UNIQUE(tenant_id,id,source_mode);

CREATE TABLE sync.ingestion_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 definition_id uuid NOT NULL,
 source_mode text NOT NULL DEFAULT 'push' CHECK (source_mode = 'push'),
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
 allowed_types text[] NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ingestion_sources_tenant_id_id_unique UNIQUE(tenant_id,id),
 CONSTRAINT ingestion_sources_definition_unique UNIQUE(tenant_id,definition_id),
 CONSTRAINT ingestion_sources_tenant_id_id_definition_unique UNIQUE(tenant_id,id,definition_id),
 CONSTRAINT ingestion_sources_definition_fk FOREIGN KEY(tenant_id,definition_id,source_mode)
   REFERENCES sync.definitions(tenant_id,id,source_mode),
 CONSTRAINT ingestion_sources_allowed_types_valid CHECK (
   cardinality(allowed_types) > 0 AND array_ndims(allowed_types) = 1
   AND array_position(allowed_types,NULL) IS NULL AND NOT ('' = ANY(allowed_types))
 )
);

ALTER TABLE sync.runs
 DROP CONSTRAINT runs_source_snapshot_valid,
 ADD CONSTRAINT runs_source_snapshot_valid CHECK (
   (source_connection_id IS NULL AND connector IS NULL AND source_collection IS NULL) OR
   (source_connection_id IS NOT NULL AND connector IS NOT NULL AND source_collection IS NOT NULL AND (
     (connector = 'academic.assignments' AND source_collection = 'assignments') OR
     (connector = 'academic.exams' AND source_collection = 'exams') OR
     (connector = 'standard.ingestion' AND btrim(source_collection) <> '')
   ))
 ),
 ADD CONSTRAINT runs_tenant_id_id_definition_unique UNIQUE(tenant_id,id,definition_id);

CREATE TABLE sync.ingestions (
 run_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 source_id uuid NOT NULL,
 definition_id uuid NOT NULL,
 schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
 operation jsonb NOT NULL CHECK (jsonb_typeof(operation) = 'object' AND operation ? 'action' AND operation->>'action' IN ('upsert','retire')),
 allowed_types text[] NOT NULL CHECK (cardinality(allowed_types)>0 AND array_ndims(allowed_types)=1 AND array_position(allowed_types,NULL) IS NULL),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ingestions_run_fk FOREIGN KEY(tenant_id,run_id,definition_id)
   REFERENCES sync.runs(tenant_id,id,definition_id) ON DELETE CASCADE,
 CONSTRAINT ingestions_source_fk FOREIGN KEY(tenant_id,source_id,definition_id)
   REFERENCES sync.ingestion_sources(tenant_id,id,definition_id)
);
CREATE INDEX ingestions_source_idx ON sync.ingestions(tenant_id,source_id,created_at,run_id);
