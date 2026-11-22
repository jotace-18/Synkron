-- Up Migration

CREATE TABLE auth.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT users_email_normalized
        CHECK (email = lower(btrim(email)) AND email <> ''),

    CONSTRAINT users_password_hash_not_empty
        CHECK (password_hash <> '')
);
