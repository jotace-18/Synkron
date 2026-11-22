CREATE TABLE monitoring.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    source_action_id uuid NOT NULL,
    message varchar(500) NOT NULL,
    source jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    read_at timestamptz,

    CONSTRAINT notifications_action_owner_unique
        UNIQUE (tenant_id, source_action_id),

    CONSTRAINT notifications_message_not_empty
        CHECK (btrim(message) <> ''),

    CONSTRAINT notifications_source_valid
        CHECK (jsonb_typeof(source) = 'object')
);

CREATE INDEX notifications_tenant_history_idx
    ON monitoring.notifications (
        tenant_id,
        created_at DESC,
        id DESC
    );

CREATE INDEX notifications_tenant_unread_idx
    ON monitoring.notifications (
        tenant_id,
        created_at DESC,
        id DESC
    )
    WHERE read_at IS NULL;