ALTER TABLE sync.runs
    ADD COLUMN claim_token uuid,
    ADD COLUMN lease_expires_at timestamptz,
    ADD CONSTRAINT runs_lease_valid CHECK (
        (claim_token IS NULL AND lease_expires_at IS NULL)
        OR (
            status = 'running'
            AND claim_token IS NOT NULL
            AND lease_expires_at IS NOT NULL
        )
    );