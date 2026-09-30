\set VERBOSITY terse
\set ON_ERROR_STOP on
BEGIN;
SET ROLE fa_owner;
GRANT CREATE ON SCHEMA public TO fa_api_gate;
SET ROLE fa_api_gate;
DROP VIEW api_pairs;
CREATE VIEW api_pairs AS SELECT * FROM message_pairs;   -- the new fence
GRANT INSERT ON api_pairs TO fa_api;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON api_pairs TO fa_api;
SET ROLE fa_owner;
REVOKE CREATE ON SCHEMA public FROM fa_api_gate;
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-0000000000d2', '/definition/', '', 'PUT',
  '00000000-0000-0000-0000-0000000000d1', clock_timestamp(),
  'digest-of-DDL-v2');
SELECT 1 / :divisor AS step_that_may_fail;
COMMIT;
