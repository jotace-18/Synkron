-- Up Migration

CREATE TABLE auth.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    absolute_expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (absolute_expires_at > created_at),
    CHECK (last_seen_at >= created_at)
);

CREATE INDEX sessions_user_id_idx ON auth.sessions(user_id);

CREATE TABLE auth.login_attempts (
    bucket text PRIMARY KEY
        CHECK (bucket ~ '^(account|ip):[a-f0-9]{64}$'),
    attempts integer NOT NULL CHECK (attempts > 0),
    expires_at timestamptz NOT NULL
);

CREATE INDEX login_attempts_expires_at_idx ON auth.login_attempts(expires_at);
