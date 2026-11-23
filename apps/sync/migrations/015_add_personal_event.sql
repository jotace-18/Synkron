-- Add the personal block without rewriting historical social.plan identities or hashes.
-- social.plan remains readable; the application only admits registered schemas for imports.
ALTER TABLE sync.activities
    DROP CONSTRAINT activities_type_valid,
    ADD CONSTRAINT activities_type_valid CHECK (type IN (
        'academic.assignment',
        'academic.exam',
        'academic.work_session',
        'academic.event',
        'sport.gym',
        'sport.football',
        'sport.hiking',
        'sport.running',
        'sport.other',
        'personal.event',
        'social.plan'
    ));
