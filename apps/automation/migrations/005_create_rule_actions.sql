CREATE TABLE automation.rule_actions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    evaluation_id uuid NOT NULL,
    action_index integer NOT NULL,
    action_type text NOT NULL,
    action jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    result_id uuid,
    attempt_count integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz DEFAULT now(),
    error_code text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    resolved_at timestamptz,

    CONSTRAINT rule_actions_evaluation_owner_fk
        FOREIGN KEY (evaluation_id, tenant_id)
        REFERENCES automation.rule_evaluations (id, tenant_id),

    CONSTRAINT rule_actions_position_unique
        UNIQUE (evaluation_id, action_index),

    CONSTRAINT rule_actions_index_valid
        CHECK (action_index BETWEEN 0 AND 4),

    CONSTRAINT rule_actions_type_valid
        CHECK (action_type IN ('notify', 'start_sync')),

    CONSTRAINT rule_actions_content_valid
        CHECK (COALESCE(
            jsonb_typeof(action) = 'object'
            AND action->>'type' = action_type,
            false
        )),

    CONSTRAINT rule_actions_attempt_count_valid
        CHECK (attempt_count >= 0),

    CONSTRAINT rule_actions_error_pair_valid
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

    CONSTRAINT rule_actions_state_valid
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
                status IN ('failed', 'blocked')
                AND result_id IS NULL
                AND resolved_at IS NOT NULL
                AND next_attempt_at IS NULL
                AND error_code IS NOT NULL
                AND error_message IS NOT NULL
            )
        )
);

CREATE INDEX rule_actions_pending_idx
    ON automation.rule_actions (action_type, next_attempt_at, id)
    WHERE status = 'pending';

CREATE INDEX rule_actions_tenant_history_idx
    ON automation.rule_actions (tenant_id, created_at DESC, id DESC);