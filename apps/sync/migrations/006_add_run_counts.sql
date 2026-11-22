ALTER TABLE sync.runs
    ADD COLUMN read_count integer NOT NULL DEFAULT 0,
    ADD COLUMN created_count integer NOT NULL DEFAULT 0,
    ADD COLUMN updated_count integer NOT NULL DEFAULT 0,
    ADD COLUMN unchanged_count integer NOT NULL DEFAULT 0,
    ADD COLUMN retired_count integer NOT NULL DEFAULT 0,
    ADD COLUMN ignored_count integer NOT NULL DEFAULT 0,

    ADD CONSTRAINT runs_counts_nonnegative
        CHECK (
            read_count >= 0
            AND created_count >= 0
            AND updated_count >= 0
            AND unchanged_count >= 0
            AND retired_count >= 0
            AND ignored_count >= 0
        ),

    ADD CONSTRAINT runs_counts_balance_valid
        CHECK (
            created_count::bigint
            + updated_count
            + unchanged_count
            + retired_count
            + ignored_count
            <= read_count
        ),

    ADD CONSTRAINT runs_completed_counts_valid
        CHECK (
            status <> 'completed'
            OR
            created_count::bigint
            + updated_count
            + unchanged_count
            + retired_count
            + ignored_count
            = read_count
        );