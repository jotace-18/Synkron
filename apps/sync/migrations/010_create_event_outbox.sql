CREATE TABLE sync.event_outbox (
    event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    schema_version integer NOT NULL DEFAULT 1,
    correlation_id uuid NOT NULL,
    causation_id uuid NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    producer text NOT NULL DEFAULT 'sync',
    payload jsonb NOT NULL,
    published_at timestamptz,

    CONSTRAINT event_outbox_type_valid
        CHECK (event_type IN (
            'data.changed',
            'sync.completed',
            'sync.failed'
        )),

    CONSTRAINT event_outbox_version_valid
        CHECK (schema_version = 1),

    CONSTRAINT event_outbox_producer_valid
        CHECK (producer = 'sync'),

    CONSTRAINT event_outbox_payload_object
        CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX event_outbox_pending_idx
    ON sync.event_outbox (occurred_at, event_id)
    WHERE published_at IS NULL;