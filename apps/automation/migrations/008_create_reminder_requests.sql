CREATE TABLE automation.reminder_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    settings_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    deadline_key varchar(80) NOT NULL,
    notify_at timestamptz NOT NULL,
    message varchar(500) NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    result_id uuid,
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz DEFAULT clock_timestamp(),
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    resolved_at timestamptz,

    CONSTRAINT reminder_requests_settings_owner_fk
        FOREIGN KEY (settings_id, tenant_id)
        REFERENCES automation.reminder_settings (id, tenant_id),

    CONSTRAINT reminder_requests_deadline_unique
        UNIQUE (tenant_id, activity_id, deadline_key),

    CONSTRAINT reminder_requests_content_valid
        CHECK (
            btrim(deadline_key) <> ''
            AND btrim(message) <> ''
        ),

    CONSTRAINT reminder_requests_attempt_count_valid
        CHECK (attempt_count >= 0),

    CONSTRAINT reminder_requests_error_pair_valid
        CHECK (
            (error_code IS NULL AND error_message IS NULL)
            OR
            (
                error_code IS NOT NULL
                AND error_message IS NOT NULL
                AND btrim(error_code) <> ''
                AND btrim(error_message) <> ''
            )
        ),

    CONSTRAINT reminder_requests_state_valid
        CHECK (
            (
                status = 'pending'
                AND result_id IS NULL
                AND resolved_at IS NULL
                AND next_attempt_at IS NOT NULL
            )
            OR
            (
                status = 'accepted'
                AND result_id IS NOT NULL
                AND resolved_at IS NOT NULL
                AND next_attempt_at IS NULL
                AND error_code IS NULL
                AND error_message IS NULL
            )
            OR
            (
                status IN ('failed', 'cancelled')
                AND result_id IS NULL
                AND resolved_at IS NOT NULL
                AND next_attempt_at IS NULL
                AND error_code IS NOT NULL
                AND error_message IS NOT NULL
            )
        )
);

CREATE INDEX reminder_requests_pending_idx
    ON automation.reminder_requests (next_attempt_at, id)
    WHERE status = 'pending';

CREATE INDEX reminder_requests_tenant_history_idx
    ON automation.reminder_requests (
        tenant_id,
        created_at DESC,
        id DESC
    );