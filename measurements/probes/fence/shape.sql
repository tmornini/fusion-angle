\pset pager off
\set VERBOSITY terse
SET ROLE ledger_app;
\echo --- S1 composed write: two rows, one statement, stamp back, bell rung
WITH landed AS (
    INSERT INTO ledger
    SELECT v.id, v.path, v.name, 'PUT', v.supersedes,
           'req', 'sec', clock_timestamp(), '7'
    FROM (VALUES
      ('00000000-0000-0000-0000-00000000e001'::uuid, '/s/', 's1',
       '00000000-0000-0000-0000-000000000000'::uuid),
      ('00000000-0000-0000-0000-00000000e002'::uuid, '/s/', 's2',
       '00000000-0000-0000-0000-000000000000'::uuid)
    ) v(id, path, name, supersedes)
    RETURNING id, path, name, response_at)
SELECT name, response_at IS NOT NULL AS got_stamp,
       pg_notify('bell', path || name) IS NOT NULL AS bell
FROM landed;
\echo --- S2 blind PUT: supersedes filled from the head, read through the view
WITH head AS (
    SELECT id, response FROM ledger
    WHERE path = '/s/' AND name = 's1' AND method IN ('PUT','DELETE')
    ORDER BY response_at DESC, id DESC LIMIT 1),
landed AS (
    INSERT INTO ledger
    SELECT '00000000-0000-0000-0000-00000000e003', '/s/', 's1', 'PUT',
           head.id, 'req', 'sec', clock_timestamp(), '8'
    FROM head WHERE head.response <> '8'
    RETURNING id, supersedes, response_at)
SELECT supersedes, response_at IS NOT NULL AS got_stamp FROM landed;
\echo --- S3 the same PUT again: state unchanged, nothing lands
WITH head AS (
    SELECT id, response FROM ledger
    WHERE path = '/s/' AND name = 's1' AND method IN ('PUT','DELETE')
    ORDER BY response_at DESC, id DESC LIMIT 1),
landed AS (
    INSERT INTO ledger
    SELECT '00000000-0000-0000-0000-00000000e004', '/s/', 's1', 'PUT',
           head.id, 'req', 'sec', clock_timestamp(), '8'
    FROM head WHERE head.response <> '8'
    RETURNING id)
SELECT count(*) AS rows_landed FROM landed;
\echo --- S4 in-order PUT naming a stale head: the index refuses
INSERT INTO ledger VALUES
 ('00000000-0000-0000-0000-00000000e005', '/s/', 's1', 'PUT',
  '00000000-0000-0000-0000-00000000e001', 'req', 'sec',
  clock_timestamp(), '9') RETURNING id;
RESET ROLE;
