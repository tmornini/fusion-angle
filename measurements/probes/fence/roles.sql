\pset pager off
\set VERBOSITY terse
CREATE ROLE ledger_owner NOLOGIN;
CREATE ROLE ledger_eraser NOLOGIN;
CREATE ROLE ledger_archiver LOGIN;
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
    response bytea NOT NULL,
    pair_hash text COLLATE "C" NOT NULL
);
CREATE INDEX message_pairs_document
    ON message_pairs (path, name, response_at, id);
INSERT INTO message_pairs VALUES
 ('00000000-0000-0000-0000-0000000000a1','/identities/alice/','pii','PUT',
  '00000000-0000-0000-0000-000000000000','req','Basic cGFzc3dvcmQ=',
  '2026-01-01T00:00:01Z','alice-v1','h-a1'),
 ('00000000-0000-0000-0000-0000000000a2','/identities/alice/','pii','PUT',
  '00000000-0000-0000-0000-0000000000a1','req','Bearer t2',
  '2026-01-01T00:00:02Z','alice-v2','h-a2'),
 ('00000000-0000-0000-0000-0000000000a3','/identities/alice/','pii','DELETE',
  '00000000-0000-0000-0000-0000000000a2','req','Bearer t3',
  '2026-01-01T00:00:03Z','','h-a3'),
 ('00000000-0000-0000-0000-0000000000b1','/identities/bob/','pii','PUT',
  '00000000-0000-0000-0000-000000000000','req','Bearer t4',
  '2026-01-01T00:00:04Z','bob-v1','h-b1'),
 ('00000000-0000-0000-0000-0000000000f1','/flows/','f','PUT',
  '00000000-0000-0000-0000-000000000000','req','Bearer t5',
  '2026-01-01T00:00:05Z','flow-v1','h-f1'),
 ('00000000-0000-0000-0000-0000000000f2','/flows/','f','DELETE',
  '00000000-0000-0000-0000-0000000000f1','req','Bearer t6',
  '2026-01-01T00:00:06Z','','h-f2');
-- the eraser's view: exactly the rows the app's view hides,
-- and only the columns an erasure needs
CREATE VIEW erasable WITH (security_barrier = true) AS
SELECT p.id, p.pair_hash
FROM message_pairs p
WHERE p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name
      AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id));
GRANT DELETE ON erasable TO ledger_eraser;
-- the archiver's view: everything but the credential column
CREATE VIEW archive AS
SELECT id, path, name, method, supersedes, request,
       response_at, response, pair_hash
FROM message_pairs;
GRANT SELECT ON archive TO ledger_archiver;
RESET ROLE;
SELECT table_name, is_updatable FROM information_schema.views
WHERE table_name IN ('erasable','archive') ORDER BY 1;

\echo ##### ERASER: DELETE privilege on its view, nothing else
SET ROLE ledger_eraser;
\echo --- E1 read its own view
SELECT * FROM erasable;
\echo --- E2 delete one row by id (WHERE names a column)
DELETE FROM erasable
WHERE id = '00000000-0000-0000-0000-0000000000a1';
\echo --- E3 the table itself
DELETE FROM message_pairs;
RESET ROLE;
SET ROLE ledger_owner;
GRANT SELECT (id, pair_hash) ON erasable TO ledger_eraser;
RESET ROLE;
SET ROLE ledger_eraser;
\echo --- E4 try to delete a live row (bob) through the view
DELETE FROM erasable
WHERE id = '00000000-0000-0000-0000-0000000000b1';
\echo --- E5 try to delete a DELETE head (alice a3) through the view
DELETE FROM erasable
WHERE id = '00000000-0000-0000-0000-0000000000a3';
\echo --- E6 erase everything erasable, naming what went
DELETE FROM erasable RETURNING id, pair_hash;
RESET ROLE;
\echo --- E7 what is left (owner looks)
SELECT path, name, method, convert_from(response,'UTF8') AS response
FROM message_pairs ORDER BY response_at;

\echo ##### ARCHIVER: SELECT on its view, nothing else
SET ROLE ledger_archiver;
\echo --- A1 copy out through the view: no credential column
COPY (SELECT id, method, pair_hash FROM archive ORDER BY response_at)
TO STDOUT;
\echo --- A2 the credential column through the view, and the table
SELECT secret FROM archive;
SELECT secret FROM message_pairs;
RESET ROLE;
\echo --- A3 restoring an archive row into the real table (owner)
SET ROLE ledger_owner;
INSERT INTO message_pairs
    (id, path, name, method, supersedes, request,
     response_at, response, pair_hash)
VALUES ('00000000-0000-0000-0000-0000000000c1','/r/','r','PUT',
  '00000000-0000-0000-0000-000000000000','req',
  '2026-01-02T00:00:00Z','restored','h-c1');
RESET ROLE;
