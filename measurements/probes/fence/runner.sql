\set VERBOSITY terse
\set ON_ERROR_STOP on
BEGIN;
CREATE VIEW :"view_name" AS SELECT id FROM message_pairs;  -- this runner's change
-- "If-Match: d1": the successor names the head this runner built on
INSERT INTO message_pairs VALUES
 (:'pair_id', '/definition/', '', 'd1', :'sql_text', clock_timestamp(), :'digest');
SELECT pg_sleep(:hold);
COMMIT;
