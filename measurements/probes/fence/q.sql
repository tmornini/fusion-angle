\pset pager off
\echo === HEAD READ
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
SELECT id, response FROM :rel
WHERE path = '/c77/' AND name = 'n7777' AND method IN ('PUT','DELETE')
ORDER BY response_at DESC, id DESC LIMIT 1;
\echo === PII HEAD READ (deleted document)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
SELECT id, response FROM :rel
WHERE path = '/identities/p500/' AND name = 'pii'
  AND method IN ('PUT','DELETE')
ORDER BY response_at DESC, id DESC LIMIT 1;
\echo === COLLECTION HEADS (100 documents x 10 versions)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
SELECT * FROM (
    SELECT DISTINCT ON (name) id, name, method, response_at, response
    FROM :rel
    WHERE path = '/c77/' AND method IN ('PUT','DELETE')
    ORDER BY name DESC, response_at DESC, id DESC) heads
WHERE method = 'PUT' ORDER BY heads.response_at, heads.id;
