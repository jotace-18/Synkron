ALTER TABLE sport.accounts
    ADD COLUMN email varchar(254),
    ADD COLUMN password_hash text,
    ADD CONSTRAINT accounts_email_unique UNIQUE (email),
    ADD CONSTRAINT accounts_identity_complete CHECK (
      (email IS NULL AND password_hash IS NULL)
      OR (email IS NOT NULL AND password_hash IS NOT NULL AND email = lower(btrim(email)))
    );

CREATE TABLE sport.browser_sessions (
    token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    account_id uuid NOT NULL REFERENCES sport.accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours'
);
CREATE INDEX browser_sessions_account_idx ON sport.browser_sessions(account_id);

CREATE TABLE sport.connection_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES sport.accounts(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL CHECK (btrim(name) <> ''),
    token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    suffix varchar(4) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);
CREATE INDEX connection_tokens_account_idx ON sport.connection_tokens(account_id);

CREATE TABLE sport.identity_rate_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0)
);
