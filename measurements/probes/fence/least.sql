\pset pager off
\set VERBOSITY terse
CREATE ROLE fa_owner NOLOGIN;
CREATE ROLE fa_api_gate NOLOGIN;
CREATE ROLE fa_api NOLOGIN;
GRANT ALL ON SCHEMA public TO fa_owner;
SET ROLE fa_owner;
CREATE TABLE message_pairs (
    id uuid PRIMARY KEY,
    path text COLLATE "C" NOT NULL,
    name text COLLATE "C" NOT NULL,
    method text COLLATE "C" NOT NULL,
    supersedes uuid NOT NULL,
    request bytea NOT NULL,
    secret bytea NOT NULL,
    response_at timestamptz NOT NULL,
    response bytea NOT NULL
);
CREATE INDEX message_pairs_document
    ON message_pairs (path, name, response_at, id);
INSERT INTO message_pairs VALUES
 (gen_random_uuid(),'/identities/p500/','pii','PUT',gen_random_uuid(),
  'req','sec','2026-01-01T00:00:01Z','hidden-pii-500'),
 (gen_random_uuid(),'/identities/p500/','pii','DELETE',gen_random_uuid(),
  'req','sec','2026-01-01T00:00:02Z','7'),
 (gen_random_uuid(),'/identities/p501/','pii','PUT',gen_random_uuid(),
  'req','sec','2026-01-01T00:00:03Z','7');
CREATE VIEW api_plain AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
CREATE VIEW api_barrier WITH (security_barrier = true) AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
CREATE VIEW pii_deletes AS
SELECT path, name, response_at, id FROM message_pairs
WHERE method = 'DELETE' AND name = 'pii';
GRANT SELECT ON pii_deletes TO fa_api_gate;
GRANT SELECT, INSERT ON message_pairs TO fa_api_gate;
ALTER TABLE message_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY gate_select ON message_pairs FOR SELECT TO fa_api_gate
    USING (NOT (name = 'pii' AND EXISTS (
        SELECT 1 FROM pii_deletes d
        WHERE d.path = message_pairs.path
          AND d.name = message_pairs.name
          AND (d.response_at, d.id)
              > (message_pairs.response_at, message_pairs.id))));
CREATE VIEW api_policy AS SELECT * FROM message_pairs;
RESET ROLE;
ALTER VIEW api_policy OWNER TO fa_api_gate;
SET ROLE fa_owner;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON api_plain, api_barrier TO fa_api;
RESET ROLE;
SET ROLE fa_api_gate;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON api_policy TO fa_api;
RESET ROLE;

\echo ##### 1. what a fresh role can do by default, holding only its view grants
SET ROLE fa_api;
\echo --- temp table
CREATE TEMP TABLE scratch (x int);
\echo --- function in its temp schema
CREATE FUNCTION pg_temp.f() RETURNS int LANGUAGE sql RETURN 1;
\echo --- function in public
CREATE FUNCTION public.f() RETURNS int LANGUAGE sql RETURN 1;
\echo --- anonymous code block
DO $$ BEGIN PERFORM 1; END $$;
\echo --- table statistics for the fenced table
SELECT count(*) AS stats_rows_visible FROM pg_stats
WHERE tablename = 'message_pairs';
RESET ROLE;

\echo ##### 2. least privilege applied
REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC;
REVOKE USAGE ON LANGUAGE plpgsql FROM PUBLIC;
\c postgres
SET ROLE fa_api;
\echo --- temp table
CREATE TEMP TABLE scratch (x int);
\echo --- function in its temp schema
CREATE FUNCTION pg_temp.f() RETURNS int LANGUAGE sql RETURN 1;
\echo --- anonymous code block
DO $$ BEGIN PERFORM 1; END $$;

\echo ##### 3. the leak, with no way left to create a function
\echo --- 3a plain view: a built-in cast that fails on the hidden row
SELECT count(*) FROM api_plain
WHERE path = '/identities/p500/'
  AND convert_from(response, 'UTF8')::int >= 0;
\echo --- 3b plain view: no value in the error text, one bit per query
\echo ---    is the hidden row's first byte an h? error means yes
SELECT count(*) FROM api_plain
WHERE path = '/identities/p500/'
  AND 1 / (CASE WHEN get_byte(response, 0) = 104 THEN 0 ELSE 1 END) = 1;
\echo ---    is it a z? a clean count means no
SELECT count(*) FROM api_plain
WHERE path = '/identities/p500/'
  AND 1 / (CASE WHEN get_byte(response, 0) = 122 THEN 0 ELSE 1 END) = 1;
\echo --- 3c barrier view, same two attacks
SELECT count(*) FROM api_barrier
WHERE path = '/identities/p500/'
  AND convert_from(response, 'UTF8')::int >= 0;
SELECT count(*) FROM api_barrier
WHERE path = '/identities/p500/'
  AND 1 / (CASE WHEN get_byte(response, 0) = 104 THEN 0 ELSE 1 END) = 1;
\echo --- 3d row policy behind the view, same two attacks
SELECT count(*) FROM api_policy
WHERE path = '/identities/p500/'
  AND convert_from(response, 'UTF8')::int >= 0;
SELECT count(*) FROM api_policy
WHERE path = '/identities/p500/'
  AND 1 / (CASE WHEN get_byte(response, 0) = 104 THEN 0 ELSE 1 END) = 1;
RESET ROLE;
