-- Existing history remains readable. Only newly accepted requests have metadata
-- and a pending job; this migration must not enqueue historical executions.
ALTER TABLE sync.runs
    ADD COLUMN request_key_hash text,
    ADD COLUMN request_fingerprint text,
    ADD COLUMN source_connection_id uuid,
    ADD COLUMN connector text,
    ADD COLUMN source_collection varchar(100),
    ADD CONSTRAINT runs_request_metadata_valid CHECK (
        (request_key_hash IS NULL AND request_fingerprint IS NULL)
        OR (request_key_hash IS NOT NULL AND request_key_hash ~ '^[a-f0-9]{64}$'
            AND request_fingerprint IS NOT NULL AND request_fingerprint ~ '^[a-f0-9]{64}$')
    ),
    ADD CONSTRAINT runs_source_snapshot_valid CHECK (
        (source_connection_id IS NULL AND connector IS NULL AND source_collection IS NULL)
        OR (source_connection_id IS NOT NULL AND connector IS NOT NULL
            AND connector = 'academic.assignments' AND source_collection IS NOT NULL
            AND source_collection = 'assignments')
    );

CREATE UNIQUE INDEX runs_request_key_unique
    ON sync.runs (tenant_id, request_key_hash)
    WHERE request_key_hash IS NOT NULL;

-- Database outbox: acceptance is durable even before a broker is available.
-- No publisher or worker is installed by this migration.
CREATE TABLE sync.run_jobs (
    run_id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    CONSTRAINT run_jobs_run_fk FOREIGN KEY (tenant_id, run_id)
        REFERENCES sync.runs (tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT run_jobs_publication_date_valid
        CHECK (published_at IS NULL OR published_at >= created_at)
);

CREATE INDEX run_jobs_pending_idx ON sync.run_jobs (created_at, run_id)
    WHERE published_at IS NULL;
