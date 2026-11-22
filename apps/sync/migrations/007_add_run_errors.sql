ALTER TABLE sync.runs
    ADD COLUMN error_code varchar(64),
    ADD COLUMN error_message varchar(500);

UPDATE sync.runs
SET error_code = 'unknown_error',
    error_message = 'La ejecución falló sin detalles registrados.'
WHERE status = 'failed';

ALTER TABLE sync.runs
    ADD CONSTRAINT runs_error_valid
        CHECK (
            (
                status = 'failed'
                AND error_code IS NOT NULL
                AND error_code ~ '^[a-z][a-z0-9_]{0,63}$'
                AND error_message IS NOT NULL
                AND btrim(error_message) <> ''
            )
            OR
            (
                status <> 'failed'
                AND error_code IS NULL
                AND error_message IS NULL
            )
        );