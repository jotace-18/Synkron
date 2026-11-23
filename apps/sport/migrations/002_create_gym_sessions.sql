CREATE TABLE sport.gym_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES sport.accounts(id),
    started_at timestamptz NOT NULL,
    duration_minutes integer NOT NULL,
    training_mode text NOT NULL,
    accompanied boolean NOT NULL,
    status text NOT NULL DEFAULT 'scheduled',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT gym_sessions_duration_valid CHECK (duration_minutes > 0),
    CONSTRAINT gym_sessions_timing_valid CHECK (
        isfinite(started_at)
        AND started_at >= '0001-01-01T00:00:00Z'::timestamptz
        AND started_at + duration_minutes * interval '1 minute' < '10000-01-01T00:00:00Z'::timestamptz
    ),
    CONSTRAINT gym_sessions_mode_valid CHECK (training_mode IN ('push','pull','leg','upper','lower','other')),
    CONSTRAINT gym_sessions_status_valid CHECK (status IN ('scheduled','completed','cancelled'))
);
CREATE INDEX gym_sessions_account_created_idx ON sport.gym_sessions(account_id, created_at DESC, id DESC);
