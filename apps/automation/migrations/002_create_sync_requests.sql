CREATE TABLE automation.sync_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    schedule_id uuid NOT NULL,
    definition_id uuid NOT NULL,
    scheduled_for timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    sync_run_id uuid,
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz DEFAULT now(),
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,

    CONSTRAINT sync_requests_schedule_owner_fk
        FOREIGN KEY (schedule_id, tenant_id)
        REFERENCES automation.schedules (id, tenant_id),

    CONSTRAINT sync_requests_occasion_unique
        UNIQUE (schedule_id, scheduled_for),

    CONSTRAINT sync_requests_status_valid
        CHECK (status IN ('pending', 'accepted', 'failed')),

    CONSTRAINT sync_requests_attempt_count_valid
        CHECK (attempt_count >= 0),

    CONSTRAINT sync_requests_error_pair_valid
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

    CONSTRAINT sync_requests_state_valid
        CHECK (
            (
                status = 'pending'
                AND sync_run_id IS NULL
                AND resolved_at IS NULL
                AND next_attempt_at IS NOT NULL
            )
            OR
            (
                status = 'accepted'
                AND sync_run_id IS NOT NULL
                AND resolved_at IS NOT NULL
                AND next_attempt_at IS NULL
                AND error_code IS NULL
                AND error_message IS NULL
            )
            OR
            (
                status = 'failed'
                AND sync_run_id IS NULL
                AND resolved_at IS NOT NULL
                AND next_attempt_at IS NULL
                AND error_code IS NOT NULL
                AND error_message IS NOT NULL
            )
        )
);

CREATE UNIQUE INDEX sync_requests_one_pending_per_schedule_idx
    ON automation.sync_requests (schedule_id)
    WHERE status = 'pending';

CREATE INDEX sync_requests_pending_idx
    ON automation.sync_requests (next_attempt_at, id)
    WHERE status = 'pending';

CREATE INDEX sync_requests_tenant_history_idx
    ON automation.sync_requests (tenant_id, created_at DESC, id DESC);