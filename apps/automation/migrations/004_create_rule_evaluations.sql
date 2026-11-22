CREATE TABLE automation.rule_events (
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

    CONSTRAINT rule_events_identity_owner_unique
        UNIQUE (event_id, tenant_id),

    CONSTRAINT rule_events_type_valid
        CHECK (event_type IN (
            'data.changed',
            'sync.completed',
            'sync.failed'
        )),

    CONSTRAINT rule_events_version_valid
        CHECK (schema_version = 1),

    CONSTRAINT rule_events_producer_valid
        CHECK (producer = 'sync'),

    CONSTRAINT rule_events_payload_valid
        CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE automation.rule_evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    event_id uuid NOT NULL,
    rule_revision integer NOT NULL,
    rule_snapshot jsonb NOT NULL,
    matched boolean NOT NULL,
    evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT rule_evaluations_identity_owner_unique
        UNIQUE (id, tenant_id),

    CONSTRAINT rule_evaluations_rule_event_unique
        UNIQUE (rule_id, event_id),

    CONSTRAINT rule_evaluations_rule_owner_fk
        FOREIGN KEY (rule_id, tenant_id)
        REFERENCES automation.rules (id, tenant_id),

    CONSTRAINT rule_evaluations_event_owner_fk
        FOREIGN KEY (event_id, tenant_id)
        REFERENCES automation.rule_events (event_id, tenant_id),

    CONSTRAINT rule_evaluations_revision_valid
        CHECK (rule_revision > 0),

    CONSTRAINT rule_evaluations_snapshot_valid
        CHECK (jsonb_typeof(rule_snapshot) = 'object')
);

CREATE INDEX rule_evaluations_tenant_history_idx
    ON automation.rule_evaluations (
        tenant_id,
        evaluated_at DESC,
        id DESC
    );