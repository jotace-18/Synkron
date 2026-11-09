CREATE TABLE sync.definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    source_connection_id uuid NOT NULL,
    name varchar(100) NOT NULL,
    connector text NOT NULL,
    source_collection varchar(100) NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT definitions_tenant_id_id_unique
        UNIQUE (tenant_id, id),

    CONSTRAINT definitions_source_connection_fk
        FOREIGN KEY (tenant_id, source_connection_id)
        REFERENCES sync.connections (tenant_id, id),

    CONSTRAINT definitions_name_not_empty
        CHECK (btrim(name) <> ''),

    CONSTRAINT definitions_connector_valid
        CHECK (connector = 'academic.assignments'),

    CONSTRAINT definitions_collection_valid
        CHECK (source_collection = 'assignments')
);

CREATE UNIQUE INDEX definitions_active_source_unique
    ON sync.definitions (
        tenant_id,
        source_connection_id,
        source_collection
    )
    WHERE enabled;
