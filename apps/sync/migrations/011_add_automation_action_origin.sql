ALTER TABLE sync.runs
    ADD COLUMN automation_action_id uuid;

ALTER TABLE sync.event_outbox
    ADD COLUMN automation_action_id uuid;