ALTER TABLE sync.connections
    ADD CONSTRAINT connections_tenant_id_id_unique
    UNIQUE (tenant_id, id);

CREATE TABLE sync.activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    source_connection_id uuid NOT NULL,
    source_collection varchar(100) NOT NULL,
    external_id varchar(256) NOT NULL,
    type text NOT NULL,
    title varchar(200) NOT NULL,
    time_kind text NOT NULL,
    time_role text NOT NULL,
    on_date date,
    at timestamptz,
    end_at timestamptz,
    status varchar(32),
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_updated_at timestamptz,
    content_hash text NOT NULL,
    last_synced_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT activities_source_connection_fk
        FOREIGN KEY (tenant_id, source_connection_id)
        REFERENCES sync.connections (tenant_id, id),

    CONSTRAINT activities_source_identity_unique
        UNIQUE (
            tenant_id,
            source_connection_id,
            source_collection,
            external_id
        ),

    CONSTRAINT activities_source_collection_not_empty
        CHECK (btrim(source_collection) <> ''),

    CONSTRAINT activities_external_id_not_empty
        CHECK (btrim(external_id) <> ''),

    CONSTRAINT activities_title_not_empty
        CHECK (btrim(title) <> ''),

    CONSTRAINT activities_type_valid
        CHECK (type IN (
            'academic.assignment',
            'academic.exam',
            'academic.work_session',
            'academic.event',
            'sport.gym',
            'sport.football',
            'sport.hiking',
            'sport.running',
            'sport.other',
            'social.plan'
        )),

    CONSTRAINT activities_time_kind_valid
        CHECK (time_kind IN ('date', 'instant', 'interval')),

    CONSTRAINT activities_time_role_valid
        CHECK (time_role IN ('deadline', 'start')),

    CONSTRAINT activities_schedule_valid
        CHECK (
            (
                time_kind = 'date'
                AND on_date IS NOT NULL
                AND at IS NULL
                AND end_at IS NULL
            )
            OR
            (
                time_kind = 'instant'
                AND on_date IS NULL
                AND at IS NOT NULL
                AND end_at IS NULL
            )
            OR
            (
                time_kind = 'interval'
                AND time_role = 'start'
                AND on_date IS NULL
                AND at IS NOT NULL
                AND end_at IS NOT NULL
                AND end_at > at
            )
        ),

    CONSTRAINT activities_status_not_empty
        CHECK (status IS NULL OR btrim(status) <> ''),

    CONSTRAINT activities_details_object
        CHECK (jsonb_typeof(details) = 'object'),

    CONSTRAINT activities_content_hash_valid
        CHECK (content_hash ~ '^[a-f0-9]{64}$')
);