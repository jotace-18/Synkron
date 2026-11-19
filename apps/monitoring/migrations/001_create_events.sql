
CREATE TABLE monitoring.events (
    event_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    schema_version integer NOT NULL,
    correlation_id uuid NOT NULL,
    causation_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    producer text NOT NULL,
    payload jsonb NOT NULL,

    CONSTRAINT events_type_valid
        CHECK (event_type IN (
            'data.changed',
            'sync.completed',
            'sync.failed'
        )),

    CONSTRAINT events_version_valid
        CHECK (schema_version = 1),

    CONSTRAINT events_producer_valid
        CHECK (producer = 'sync'),

    CONSTRAINT events_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX events_tenant_history_idx
    ON monitoring.events (
        tenant_id,
        occurred_at DESC,
        event_id DESC
    );

CREATE INDEX events_tenant_correlation_idx
    ON monitoring.events (
        tenant_id,
        correlation_id,
        occurred_at,
        event_id
    );