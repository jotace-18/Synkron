CREATE TABLE academic.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    token_hash text NOT NULL UNIQUE,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT accounts_name_not_empty
        CHECK (btrim(name) <> ''),

    CONSTRAINT accounts_token_hash_valid
        CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

ALTER TABLE academic.assignments
    ADD CONSTRAINT assignments_account_fk
    FOREIGN KEY (account_id)
    REFERENCES academic.accounts (id);
