\pset pager off
\set VERBOSITY terse
SET client_min_messages = notice;
SET ROLE fa_owner;
CREATE VIEW api_pairs_plain AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON api_pairs_plain TO fa_api;
RESET ROLE;
SET ROLE fa_api;
\echo --- can the app role make its own function? (temp schema)
CREATE FUNCTION pg_temp.leak(bytea) RETURNS boolean
LANGUAGE plpgsql COST 0.0000001 AS $$
BEGIN
    IF convert_from($1, 'UTF8') LIKE 'hidden-%' THEN
        RAISE NOTICE 'LEAKED %', convert_from($1, 'UTF8');
    END IF;
    RETURN true;
END $$;
\echo --- plain view, one deleted identity
SELECT count(*) AS plain_rows FROM api_pairs_plain
WHERE path = '/identities/p500/' AND pg_temp.leak(response);
\echo --- X barrier view
SELECT count(*) AS x_rows FROM api_pairs_x
WHERE path = '/identities/p500/' AND pg_temp.leak(response);
\echo --- Y plain view over a row policy
SELECT count(*) AS y_rows FROM api_pairs_y
WHERE path = '/identities/p500/' AND pg_temp.leak(response);
\echo --- Y head read of a deleted identity, and its plan
SELECT method, convert_from(response,'UTF8') AS response FROM api_pairs_y
WHERE path = '/identities/p500/' AND name = 'pii'
  AND method IN ('PUT','DELETE')
ORDER BY response_at DESC, id DESC LIMIT 1;
EXPLAIN (COSTS OFF)
SELECT id, response FROM api_pairs_y
WHERE path = '/huge/' AND name = 'h' AND method IN ('PUT','DELETE')
ORDER BY response_at DESC, id DESC LIMIT 1;
RESET ROLE;
