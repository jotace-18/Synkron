CREATE TABLE automation.schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name varchar(150) NOT NULL,
    definition_id uuid NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    schedule_kind text NOT NULL,
    interval_minutes integer,
    daily_time time(0),
    timezone text NOT NULL DEFAULT 'Europe/Madrid',
    next_run_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT schedules_identity_owner_unique
        UNIQUE (id, tenant_id),

    CONSTRAINT schedules_name_not_empty
        CHECK (btrim(name) <> ''),

    CONSTRAINT schedules_kind_valid
        CHECK (schedule_kind IN ('interval', 'daily')),

    CONSTRAINT schedules_timing_valid
        CHECK (
            (
                schedule_kind = 'interval'
                AND interval_minutes IS NOT NULL
                AND interval_minutes IN (15, 30, 60)
                AND daily_time IS NULL
            )
            OR
            (
                schedule_kind = 'daily'
                AND daily_time IS NOT NULL
                AND interval_minutes IS NULL
                AND daily_time < TIME '24:00:00'
                AND EXTRACT(SECOND FROM daily_time) = 0
            )
        ),

    CONSTRAINT schedules_timezone_valid
        CHECK (timezone = 'Europe/Madrid'),

    CONSTRAINT schedules_next_run_valid
        CHECK (enabled = (next_run_at IS NOT NULL))
);

CREATE INDEX schedules_due_idx
    ON automation.schedules (next_run_at, id)
    WHERE enabled;