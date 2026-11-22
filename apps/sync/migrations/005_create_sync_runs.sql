CREATE TABLE sync.runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    definition_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,

    CONSTRAINT runs_tenant_id_id_unique
        UNIQUE (tenant_id, id),

    CONSTRAINT runs_definition_fk
        FOREIGN KEY (tenant_id, definition_id)
        REFERENCES sync.definitions (tenant_id, id),

    CONSTRAINT runs_status_valid
        CHECK (status IN ('queued', 'running', 'completed', 'failed')),

    CONSTRAINT runs_state_dates_valid
        CHECK (
            (
                status = 'queued'
                AND started_at IS NULL
                AND finished_at IS NULL
            )
            OR
            (
                status = 'running'
                AND started_at IS NOT NULL
                AND finished_at IS NULL
            )
            OR
            (
                status IN ('completed', 'failed')
                AND started_at IS NOT NULL
                AND finished_at IS NOT NULL
            )
        ),

    CONSTRAINT runs_time_order_valid
        CHECK (
            (started_at IS NULL OR started_at >= created_at)
            AND
            (finished_at IS NULL OR finished_at >= started_at)
        )
);