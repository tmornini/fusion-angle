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
CREATE INDEX message_pairs_collection
    ON message_pairs (path, response_at, id);
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/c' || (d / 100) || '/', 'n' || d, 'PUT',
       gen_random_uuid(), 'req', 'sec',
       timestamptz '2026-02-01' + (d * 10 + v) * interval '1 second',
       convert_to('7', 'UTF8')
FROM generate_series(1, 20000) d, generate_series(1, 10) v;
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/identities/p' || d || '/', 'pii', 'PUT',
       gen_random_uuid(), 'req', 'sec',
       timestamptz '2026-03-01' + (d * 10 + v) * interval '1 second',
       convert_to(CASE WHEN d <= 1000 THEN 'hidden-pii-' || d
                       ELSE '7' END, 'UTF8')
FROM generate_series(1, 2000) d, generate_series(1, 3) v;
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/identities/p' || d || '/', 'pii', 'DELETE',
       gen_random_uuid(), 'req', 'sec',
       timestamptz '2026-03-01' + (d * 10 + 9) * interval '1 second',
       convert_to('7', 'UTF8')
FROM generate_series(1, 1000) d;
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/big/', 'b', 'PUT', gen_random_uuid(),
       'req', 'sec', timestamptz '2026-04-01' + v * interval '1 second',
       convert_to('7', 'UTF8')
FROM generate_series(1, 5000) v;
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/huge/', 'h', 'PUT', gen_random_uuid(),
       'req', 'sec', timestamptz '2026-05-01' + v * interval '1 second',
       convert_to('7', 'UTF8')
FROM generate_series(1, 50000) v;
ANALYZE message_pairs;

-- X: the barrier view, hiding rule in its WHERE
CREATE VIEW api_pairs_x WITH (security_barrier = true) AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
-- Z: the same, ordered inside
CREATE VIEW api_pairs_z WITH (security_barrier = true) AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)))
ORDER BY p.response_at DESC, p.id DESC;
-- Y: plain view owned by a gate role; hiding rule as a row policy
--    on that gate role; the policy reads DELETEs through a helper
--    view the table owner owns, which sidesteps the recursion
CREATE VIEW pii_deletes AS
SELECT path, name, response_at, id FROM message_pairs
WHERE method = 'DELETE' AND name = 'pii';
GRANT SELECT ON pii_deletes TO fa_api_gate;
GRANT SELECT, INSERT ON message_pairs TO fa_api_gate;
ALTER TABLE message_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY gate_insert ON message_pairs FOR INSERT TO fa_api_gate
    WITH CHECK (true);
CREATE POLICY gate_select ON message_pairs FOR SELECT TO fa_api_gate
    USING (NOT (name = 'pii' AND EXISTS (
        SELECT 1 FROM pii_deletes d
        WHERE d.path = message_pairs.path
          AND d.name = message_pairs.name
          AND (d.response_at, d.id)
              > (message_pairs.response_at, message_pairs.id))));
CREATE VIEW api_pairs_y AS SELECT * FROM message_pairs;
RESET ROLE;
ALTER VIEW api_pairs_y OWNER TO fa_api_gate;
SET ROLE fa_owner;
GRANT INSERT ON api_pairs_x, api_pairs_z TO fa_api;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON api_pairs_x, api_pairs_z TO fa_api;
RESET ROLE;
SET ROLE fa_api_gate;
GRANT INSERT ON api_pairs_y TO fa_api;
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON api_pairs_y TO fa_api;
RESET ROLE;

\echo ##### correctness of each design, as fa_api
SET ROLE fa_api;
\echo --- rows visible (table holds 262000 rows, 3000 of them hidden)
SELECT (SELECT count(*) FROM api_pairs_x) AS x,
       (SELECT count(*) FROM api_pairs_y) AS y,
       (SELECT count(*) FROM api_pairs_z) AS z;
\echo --- leak probe: a cast that fails only on hidden rows
SELECT count(*) AS x_ok FROM api_pairs_x
WHERE path LIKE '/identities/%' AND convert_from(response,'UTF8')::int >= 0;
SELECT count(*) AS y_ok FROM api_pairs_y
WHERE path LIKE '/identities/%' AND convert_from(response,'UTF8')::int >= 0;
SELECT count(*) AS z_ok FROM api_pairs_z
WHERE path LIKE '/identities/%' AND convert_from(response,'UTF8')::int >= 0;
\echo --- fenced column and the table, under Y
SELECT request FROM api_pairs_y LIMIT 1;
SELECT id FROM message_pairs LIMIT 1;
\echo --- insert through each view, stamp back
INSERT INTO api_pairs_x VALUES (gen_random_uuid(), '/w/', 'x', 'PUT',
  gen_random_uuid(), 'req', 'sec', clock_timestamp(), '7')
  RETURNING response_at IS NOT NULL AS x_stamp;
INSERT INTO api_pairs_y VALUES (gen_random_uuid(), '/w/', 'y', 'PUT',
  gen_random_uuid(), 'req', 'sec', clock_timestamp(), '7')
  RETURNING response_at IS NOT NULL AS y_stamp;
INSERT INTO api_pairs_z VALUES (gen_random_uuid(), '/w/', 'z', 'PUT',
  gen_random_uuid(), 'req', 'sec', clock_timestamp(), '7')
  RETURNING response_at IS NOT NULL AS z_stamp;
RESET ROLE;
\echo --- the owner, and so the eraser and archiver views, still see all
SET ROLE fa_owner;
SELECT count(*) AS owner_sees FROM message_pairs;
RESET ROLE;
