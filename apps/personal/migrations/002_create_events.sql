CREATE FUNCTION personal.valid_people(people text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT cardinality(people) <= 50
    AND (cardinality(people) = 0 OR array_ndims(people) = 1)
    AND NOT EXISTS (
      SELECT 1 FROM unnest(people) AS person(name)
      WHERE name IS NULL OR length(name) NOT BETWEEN 1 AND 100 OR btrim(name) = ''
    );
$$;

CREATE TABLE personal.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES personal.accounts(id),
    title varchar(200) NOT NULL,
    on_date date,
    started_at timestamptz,
    duration_minutes integer,
    people text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT events_title_valid CHECK (btrim(title) <> ''),
    CONSTRAINT events_schedule_valid CHECK (
        (on_date IS NOT NULL AND started_at IS NULL AND duration_minutes IS NULL)
        OR (on_date IS NULL AND started_at IS NOT NULL)
    ),
    CONSTRAINT events_duration_valid CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT events_timing_valid CHECK (
        (on_date IS NULL OR (isfinite(on_date) AND on_date >= '0001-01-01'::date AND on_date < '10000-01-01'::date))
        AND (started_at IS NULL OR (isfinite(started_at) AND started_at >= '0001-01-01T00:00:00Z'::timestamptz AND started_at < '10000-01-01T00:00:00Z'::timestamptz
            AND (duration_minutes IS NULL OR started_at + duration_minutes * interval '1 minute' < '10000-01-01T00:00:00Z'::timestamptz)))
    ),
    CONSTRAINT events_people_valid CHECK (personal.valid_people(people)),
    CONSTRAINT events_status_valid CHECK (status IN ('pending','completed','cancelled'))
);
CREATE INDEX events_account_created_idx ON personal.events(account_id, created_at DESC, id DESC);
