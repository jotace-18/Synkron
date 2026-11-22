CREATE TABLE automation.reminder_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    lead_minutes integer NOT NULL DEFAULT 1440,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT reminder_settings_tenant_unique
        UNIQUE (tenant_id),

    CONSTRAINT reminder_settings_identity_owner_unique
        UNIQUE (id, tenant_id),

    CONSTRAINT reminder_settings_lead_minutes_valid
        CHECK (lead_minutes IN (60, 1440))
);