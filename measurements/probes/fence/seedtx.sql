\set VERBOSITY terse
\set ON_ERROR_STOP on
BEGIN;
SET ROLE fa_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO fa_api, fa_api_gate;
CREATE TABLE message_pairs (id int PRIMARY KEY, path text NOT NULL,
    request bytea NOT NULL, response_at timestamptz NOT NULL,
    response bytea NOT NULL);
ALTER TABLE message_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY gate_insert ON message_pairs FOR INSERT TO fa_api_gate
    WITH CHECK (true);
GRANT SELECT, INSERT ON message_pairs TO fa_api_gate;
GRANT CREATE ON SCHEMA public TO fa_api_gate;
SET ROLE fa_api_gate;
CREATE VIEW api_pairs AS SELECT * FROM message_pairs;
GRANT INSERT ON api_pairs TO fa_api;
SET ROLE fa_owner;
REVOKE CREATE ON SCHEMA public FROM fa_api_gate;
INSERT INTO message_pairs
SELECT g, '/seed/', 'req', clock_timestamp(), 'res'
FROM generate_series(1, 500) g;
INSERT INTO message_pairs
SELECT g, '/seed/', 'req', clock_timestamp(), 'res'
FROM generate_series(:second_batch_start, :second_batch_start + 499) g;
COMMIT;
