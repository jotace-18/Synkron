CREATE TABLE sync.connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    auth_type text NOT NULL,
    credentials_encrypted text,
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT connections_name_not_empty
        CHECK (btrim(name) <> ''),

    CONSTRAINT connections_base_url_not_empty
        CHECK (btrim(base_url) <> ''),

    CONSTRAINT connections_auth_type_valid
        CHECK (auth_type IN ('none', 'bearer')),

    CONSTRAINT connections_credentials_valid
        CHECK (
            (auth_type = 'none' AND credentials_encrypted IS NULL)
            OR
            (auth_type = 'bearer'
                AND credentials_encrypted IS NOT NULL
                AND btrim(credentials_encrypted) <> '')
        )
);

CREATE INDEX connections_tenant_id_idx
    ON sync.connections (tenant_id);