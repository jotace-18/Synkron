CREATE TABLE automation.rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name varchar(150) NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    trigger_event_type text NOT NULL,
    condition_group jsonb NOT NULL,
    actions jsonb NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT rules_identity_owner_unique
        UNIQUE (id, tenant_id),

    CONSTRAINT rules_name_not_empty
        CHECK (btrim(name) <> ''),

    CONSTRAINT rules_trigger_valid
        CHECK (trigger_event_type IN (
            'data.changed',
            'sync.completed',
            'sync.failed'
        )),

    CONSTRAINT rules_condition_group_valid
        CHECK (COALESCE(
            jsonb_typeof(condition_group) = 'object'
            AND condition_group->>'mode' IN ('all', 'any'),
            false
        )),

    CONSTRAINT rules_condition_count_valid
        CHECK (
            CASE
                WHEN jsonb_typeof(
                    condition_group->'conditions'
                ) = 'array'
                THEN jsonb_array_length(
                    condition_group->'conditions'
                ) BETWEEN 0 AND 10
                ELSE false
            END
        ),

    CONSTRAINT rules_actions_valid
        CHECK (
            CASE
                WHEN jsonb_typeof(actions) = 'array'
                THEN jsonb_array_length(actions) BETWEEN 1 AND 5
                ELSE false
            END
        ),

    CONSTRAINT rules_revision_valid
        CHECK (revision > 0)
);

CREATE INDEX rules_enabled_trigger_idx
    ON automation.rules (tenant_id, trigger_event_type, id)
    WHERE enabled;