\pset pager off
\set VERBOSITY terse
CREATE ROLE fa_owner NOLOGIN;
CREATE ROLE fa_api_a NOLOGIN;   -- option A's app role
CREATE ROLE fa_api_b NOLOGIN;   -- option B's app role
CREATE ROLE fa_eraser NOLOGIN;
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
CREATE UNIQUE INDEX message_pairs_succession
    ON message_pairs (path, name, supersedes)
    WHERE method IN ('PUT', 'DELETE');
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-0000000000a1','/identities/alice/','pii','PUT',
  '00000000-0000-0000-0000-000000000000','alice-request','alice-secret',
  '2026-01-01T00:00:01Z','alice-v1'),
 ('00000000-0000-0000-0000-0000000000a3','/identities/alice/','pii','DELETE',
  '00000000-0000-0000-0000-0000000000a1','req','sec',
  '2026-01-01T00:00:03Z',''),
 ('00000000-0000-0000-0000-0000000000b1','/identities/bob/','pii','PUT',
  '00000000-0000-0000-0000-000000000000','bob-request','bob-secret',
  '2026-01-01T00:00:04Z','bob-v1');
-- A: one view, every column, both directions
CREATE VIEW api_pairs WITH (security_barrier = true) AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
GRANT INSERT ON api_pairs TO fa_api_a;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON api_pairs TO fa_api_a;
-- B: insert on the table, read view that omits the fenced columns
CREATE VIEW pairs_read WITH (security_barrier = true) AS
SELECT p.id, p.path, p.name, p.method, p.supersedes,
       p.response_at, p.response
FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
GRANT INSERT ON message_pairs TO fa_api_b;
GRANT SELECT ON pairs_read TO fa_api_b;
RESET ROLE;

\echo ##### OPTION B through item 0's four statement shapes
SET ROLE fa_api_b;
\echo --- BS1 composed write: two rows, per-row stamp back, bell per row
WITH to_land AS MATERIALIZED (
    SELECT v.id, v.path, v.name, v.supersedes,
           clock_timestamp() AS at
    FROM (VALUES
      ('00000000-0000-0000-0000-00000000e001'::uuid, '/s/', 's1',
       '00000000-0000-0000-0000-000000000000'::uuid),
      ('00000000-0000-0000-0000-00000000e002'::uuid, '/s/', 's2',
       '00000000-0000-0000-0000-000000000000'::uuid)
    ) v(id, path, name, supersedes)),
landed AS (
    INSERT INTO message_pairs
    SELECT id, path, name, 'PUT', supersedes, 'req', 'sec', at, '7'
    FROM to_land
    RETURNING 1)
SELECT name, at IS NOT NULL AS got_stamp,
       pg_notify('bell', path || name) IS NOT NULL AS bell
FROM to_land;
\echo --- BS2 blind PUT: head read through the view, decision in the CTE
WITH head AS (
    SELECT id, response FROM pairs_read
    WHERE path = '/s/' AND name = 's1' AND method IN ('PUT','DELETE')
    ORDER BY response_at DESC, id DESC LIMIT 1),
to_land AS MATERIALIZED (
    SELECT '00000000-0000-0000-0000-00000000e003'::uuid AS id,
           head.id AS supersedes, clock_timestamp() AS at
    FROM head WHERE head.response <> '8'),
landed AS (
    INSERT INTO message_pairs
    SELECT id, '/s/', 's1', 'PUT', supersedes, 'req', 'sec', at, '8'
    FROM to_land
    RETURNING 1)
SELECT supersedes, at IS NOT NULL AS got_stamp FROM to_land;
\echo --- BS3 the same PUT again: nothing lands
WITH head AS (
    SELECT id, response FROM pairs_read
    WHERE path = '/s/' AND name = 's1' AND method IN ('PUT','DELETE')
    ORDER BY response_at DESC, id DESC LIMIT 1),
to_land AS MATERIALIZED (
    SELECT '00000000-0000-0000-0000-00000000e004'::uuid AS id,
           head.id AS supersedes, clock_timestamp() AS at
    FROM head WHERE head.response <> '8'),
landed AS (
    INSERT INTO message_pairs
    SELECT id, '/s/', 's1', 'PUT', supersedes, 'req', 'sec', at, '8'
    FROM to_land
    RETURNING 1)
SELECT count(*) AS rows_landed FROM to_land;
\echo --- BS4 in-order PUT naming a stale head: the index refuses
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-00000000e005', '/s/', 's1', 'PUT',
  '00000000-0000-0000-0000-00000000e001', 'req', 'sec',
  clock_timestamp(), '9');
\echo --- BS5 can B name a stored column on the way back?
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-00000000e006', '/s/', 's6', 'PUT',
  '00000000-0000-0000-0000-000000000000', 'req', 'sec',
  clock_timestamp(), '9') RETURNING id;
\echo --- BS6 reading: star works on B's view; fenced column is absent
SELECT count(*) AS star_rows FROM (SELECT * FROM pairs_read) s;
SELECT request FROM pairs_read LIMIT 1;
SELECT request FROM message_pairs LIMIT 1;
RESET ROLE;

\echo ##### OPTION A: star and fenced reads
SET ROLE fa_api_a;
SELECT * FROM api_pairs LIMIT 1;
SELECT request FROM api_pairs LIMIT 1;
SELECT id FROM message_pairs LIMIT 1;
RESET ROLE;

\echo ##### FAILURE MODES: one sloppy grant each
SET ROLE fa_owner;
GRANT SELECT ON api_pairs TO fa_api_a;       -- A: column list dropped
GRANT SELECT ON message_pairs TO fa_api_b;   -- B: SELECT lands on the table
RESET ROLE;
\echo --- FA what A's app can now read
SET ROLE fa_api_a;
SELECT path, convert_from(request,'UTF8') AS request,
       convert_from(secret,'UTF8') AS secret
FROM api_pairs WHERE path LIKE '/identities/%' ORDER BY response_at;
RESET ROLE;
\echo --- FB what B's app can now read
SET ROLE fa_api_b;
SELECT path, method, convert_from(request,'UTF8') AS request,
       convert_from(secret,'UTF8') AS secret,
       convert_from(response,'UTF8') AS response
FROM message_pairs WHERE path LIKE '/identities/%' ORDER BY response_at;
RESET ROLE;
\echo --- the boot check sees both mistakes
SELECT has_column_privilege('fa_api_a','api_pairs','request','SELECT')
           AS a_reads_request,
       has_table_privilege('fa_api_b','message_pairs','SELECT')
           AS b_reads_table;
SET ROLE fa_owner;
REVOKE SELECT ON api_pairs FROM fa_api_a;
REVOKE SELECT ON message_pairs FROM fa_api_b;
RESET ROLE;
\echo --- after the repair: REVOKE of the whole-view grant kept the columns?
SELECT has_column_privilege('fa_api_a','api_pairs','request','SELECT')
           AS a_reads_request,
       has_column_privilege('fa_api_a','api_pairs','response','SELECT')
           AS a_reads_response,
       has_table_privilege('fa_api_b','message_pairs','SELECT')
           AS b_reads_table;

\echo ##### LATER: a view can limit what a role may insert
SET ROLE fa_owner;
CREATE VIEW erasure_records AS
SELECT * FROM message_pairs WHERE path = '/erasures/'
WITH CHECK OPTION;
GRANT INSERT ON erasure_records TO fa_eraser;
RESET ROLE;
SET ROLE fa_eraser;
INSERT INTO erasure_records VALUES
 ('00000000-0000-0000-0000-00000000f001', '/erasures/', 'x', 'POST',
  '00000000-0000-0000-0000-000000000000', '', '', clock_timestamp(), 'ok');
INSERT INTO erasure_records VALUES
 ('00000000-0000-0000-0000-00000000f002', '/flows/', 'forged', 'PUT',
  '00000000-0000-0000-0000-000000000000', '', '', clock_timestamp(), 'x');
RESET ROLE;
