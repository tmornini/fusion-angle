\pset pager off
\set VERBOSITY terse
\echo ##### SETUP
CREATE ROLE ledger_owner NOLOGIN;
CREATE ROLE ledger_app NOLOGIN;
GRANT ALL ON SCHEMA public TO ledger_owner;
SET ROLE ledger_owner;
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
-- alice: pii PUT, PUT, DELETE (two hidden, DELETE head visible)
-- bob:   pii PUT (live, visible)
-- flow:  PUT, DELETE (history stays visible)
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-0000000000a1','/identities/alice/','pii','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  '2026-01-01T00:00:01Z','hidden-pii-alice-v1'),
 ('00000000-0000-0000-0000-0000000000a2','/identities/alice/','pii','PUT',
  '00000000-0000-0000-0000-0000000000a1','req','sec',
  '2026-01-01T00:00:02Z','hidden-pii-alice-v2'),
 ('00000000-0000-0000-0000-0000000000a3','/identities/alice/','pii','DELETE',
  '00000000-0000-0000-0000-0000000000a2','req','sec',
  '2026-01-01T00:00:03Z','3'),
 ('00000000-0000-0000-0000-0000000000b1','/identities/bob/','pii','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  '2026-01-01T00:00:04Z','4'),
 ('00000000-0000-0000-0000-0000000000f1','/flows/','f','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  '2026-01-01T00:00:05Z','5'),
 ('00000000-0000-0000-0000-0000000000f2','/flows/','f','DELETE',
  '00000000-0000-0000-0000-0000000000f1','req','sec',
  '2026-01-01T00:00:06Z','6');
CREATE VIEW pairs AS
SELECT p.id, p.path, p.name, p.method, p.supersedes,
       p.response_at, p.response
FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name
      AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
GRANT INSERT ON message_pairs TO ledger_app;
GRANT SELECT ON pairs TO ledger_app;
RESET ROLE;

\echo ##### T0 BASELINE: INSERT on table + SELECT on view only
SET ROLE ledger_app;
\echo --- T0.1 insert, no RETURNING
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-000000000c01','/t/','t01','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7');
\echo --- T0.2 insert RETURNING response_at  (the collision)
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-000000000c02','/t/','t02','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7') RETURNING response_at;
\echo --- T0.3 insert RETURNING a constant
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-000000000c03','/t/','t03','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7') RETURNING 1 AS landed;
\echo --- T0.4 stamp minted in a CTE, returned from the CTE, bell rung
WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS at),
landed AS (
    INSERT INTO message_pairs
    SELECT '00000000-0000-0000-0000-000000000c04','/t/','t04','PUT',
           '00000000-0000-0000-0000-000000000000','req','sec',
           stamp.at,'7'
    FROM stamp
    RETURNING 1)
SELECT stamp.at AS minted,
       (SELECT count(*) FROM landed) AS rows_landed,
       pg_notify('bell', 't04') IS NOT NULL AS bell
FROM stamp;
\echo --- T0.5 same, but the insert is a no-op (WHERE false)
WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS at),
landed AS (
    INSERT INTO message_pairs
    SELECT '00000000-0000-0000-0000-000000000c05','/t/','t05','PUT',
           '00000000-0000-0000-0000-000000000000','req','sec',
           stamp.at,'7'
    FROM stamp WHERE false
    RETURNING 1)
SELECT (SELECT count(*) FROM landed) AS rows_landed FROM stamp;
\echo --- T0.6 direct table reads
SELECT response FROM message_pairs LIMIT 1;
\echo --- T0.7 the view hides alice v1, v2 only
SELECT path, name, method, convert_from(response,'UTF8') AS response
FROM pairs ORDER BY response_at;
\echo --- T0.8 stamp stored = stamp returned? (owner checks)
RESET ROLE;
SELECT name, response_at FROM message_pairs WHERE name = 't04';

\echo ##### LEAK: plain view vs security_barrier view
SET ROLE ledger_app;
\echo --- L1 plain view, cast that fails only on hidden rows
SELECT count(*) FROM pairs
WHERE convert_from(response,'UTF8')::int >= 0;
RESET ROLE;
SET ROLE ledger_owner;
ALTER VIEW pairs SET (security_barrier = true);
RESET ROLE;
SET ROLE ledger_app;
\echo --- L2 security_barrier view, same query
SELECT count(*) FROM pairs
WHERE convert_from(response,'UTF8')::int >= 0;
RESET ROLE;

\echo ##### OPTION A: column grants on the table
SET ROLE ledger_owner;
GRANT SELECT (id, response_at) ON message_pairs TO ledger_app;
RESET ROLE;
SET ROLE ledger_app;
\echo --- A1 insert RETURNING response_at
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-000000000a01','/t/','a01','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7') RETURNING response_at IS NOT NULL AS got_stamp;
\echo --- A2 granted columns read for EVERY row, hidden included
SELECT id, response_at FROM message_pairs
WHERE id IN ('00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-0000000000a2');
\echo --- A3 ungranted column still denied
SELECT response FROM message_pairs LIMIT 1;
RESET ROLE;
SET ROLE ledger_owner;
REVOKE SELECT (id, response_at) ON message_pairs FROM ledger_app;
RESET ROLE;

\echo ##### OPTION B: SECURITY DEFINER function, app has EXECUTE only
SET ROLE ledger_owner;
CREATE FUNCTION land_pair(
    p_id uuid, p_path text, p_name text, p_method text,
    p_supersedes uuid, p_request bytea, p_secret bytea,
    p_response bytea)
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public
BEGIN ATOMIC
    WITH landed AS (
        INSERT INTO public.message_pairs VALUES (
            p_id, p_path, p_name, p_method, p_supersedes,
            p_request, p_secret, clock_timestamp(), p_response)
        RETURNING id, response_at)
    SELECT response_at FROM landed
    WHERE pg_notify('bell', id::text) IS NOT NULL;
END;
REVOKE ALL ON FUNCTION land_pair FROM PUBLIC;
GRANT EXECUTE ON FUNCTION land_pair TO ledger_app;
REVOKE INSERT ON message_pairs FROM ledger_app;
RESET ROLE;
SET ROLE ledger_app;
\echo --- B1 call the function
SELECT land_pair('00000000-0000-0000-0000-000000000b01','/t/','b01',
    'PUT','00000000-0000-0000-0000-000000000000','req','sec','7')
    IS NOT NULL AS got_stamp;
\echo --- B2 direct insert now denied
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-000000000b02','/t/','b02','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7');
\echo --- B3 second successor of one head: the index still refuses
SELECT land_pair('00000000-0000-0000-0000-000000000b03','/t/','b01',
    'PUT','00000000-0000-0000-0000-000000000000','req','sec','7');
RESET ROLE;
SET ROLE ledger_owner;
DROP FUNCTION land_pair;
RESET ROLE;

\echo ##### OPTION C: row-level security on the table
SET ROLE ledger_owner;
ALTER TABLE message_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_insert ON message_pairs FOR INSERT TO ledger_app
    WITH CHECK (true);
CREATE POLICY app_select ON message_pairs FOR SELECT TO ledger_app
    USING (NOT (name = 'pii' AND EXISTS (
        SELECT 1 FROM message_pairs d
        WHERE d.path = message_pairs.path
          AND d.name = message_pairs.name
          AND d.method = 'DELETE'
          AND (d.response_at, d.id)
              > (message_pairs.response_at, message_pairs.id))));
GRANT INSERT ON message_pairs TO ledger_app;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON message_pairs TO ledger_app;
RESET ROLE;
SET ROLE ledger_app;
\echo --- C1 read under a self-referencing policy
SELECT name, method FROM message_pairs ORDER BY response_at;
RESET ROLE;
SET ROLE ledger_owner;
DROP POLICY app_select ON message_pairs;
CREATE FUNCTION pii_erased(p_path text, p_name text,
    p_at timestamptz, p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
RETURN p_name = 'pii' AND EXISTS (
    SELECT 1 FROM public.message_pairs d
    WHERE d.path = p_path AND d.name = p_name
      AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p_at, p_id));
CREATE POLICY app_select ON message_pairs FOR SELECT TO ledger_app
    USING (NOT pii_erased(path, name, response_at, id));
RESET ROLE;
SET ROLE ledger_app;
\echo --- C2 read with the predicate behind a definer function
SELECT path, name, method FROM message_pairs
WHERE path LIKE '/identities/%' OR path = '/flows/'
ORDER BY response_at;
\echo --- C3 insert RETURNING under RLS
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-000000000c31','/t/','c31','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7') RETURNING response_at IS NOT NULL AS got_stamp;
\echo --- C4 fenced column denied; leak probe under RLS
SELECT request FROM message_pairs LIMIT 1;
SELECT count(*) FROM message_pairs
WHERE path LIKE '/identities/%'
  AND convert_from(response,'UTF8')::int >= 0;
RESET ROLE;
SET ROLE ledger_owner;
DROP POLICY app_select ON message_pairs;
DROP POLICY app_insert ON message_pairs;
ALTER TABLE message_pairs DISABLE ROW LEVEL SECURITY;
DROP FUNCTION pii_erased;
REVOKE ALL ON message_pairs FROM ledger_app;
REVOKE SELECT (id, path, name, method, supersedes, response_at, response)
    ON message_pairs FROM ledger_app;
RESET ROLE;

\echo ##### OPTION D: one view, all columns, read AND write through it
SET ROLE ledger_owner;
CREATE VIEW ledger WITH (security_barrier = true) AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name
      AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
GRANT INSERT ON ledger TO ledger_app;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON ledger TO ledger_app;
RESET ROLE;
SELECT table_name, is_insertable_into
FROM information_schema.tables WHERE table_name IN ('ledger','pairs');
SET ROLE ledger_app;
\echo --- D1 insert through the view, RETURNING the stamp
INSERT INTO ledger VALUES
 ('00000000-0000-0000-0000-000000000d01','/t/','d01','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7') RETURNING response_at IS NOT NULL AS got_stamp;
\echo --- D2 RETURNING a fenced column
INSERT INTO ledger VALUES
 ('00000000-0000-0000-0000-000000000d02','/t/','d02','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7') RETURNING request;
\echo --- D3 reading a fenced column through the view
SELECT request FROM ledger LIMIT 1;
\echo --- D4 the row fence holds through the same view
SELECT path, name, method FROM ledger
WHERE path LIKE '/identities/%' ORDER BY response_at;
\echo --- D5 no privilege on the table at all
SELECT id FROM message_pairs LIMIT 1;
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-000000000d05','/t/','d05','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7');
\echo --- D6 second successor of one head, through the view
INSERT INTO ledger VALUES
 ('00000000-0000-0000-0000-000000000d06','/t/','d01','PUT',
  '00000000-0000-0000-0000-000000000000','req','sec',
  clock_timestamp(),'7');
\echo --- D7 append-only: update and delete through the view
UPDATE ledger SET response = 'x' WHERE name = 'd01';
DELETE FROM ledger WHERE name = 'd01';
\echo --- D8 leak probe through the barrier view
SELECT count(*) FROM ledger
WHERE path LIKE '/identities/%'
  AND convert_from(response,'UTF8')::int >= 0;
RESET ROLE;
\echo ##### DONE
