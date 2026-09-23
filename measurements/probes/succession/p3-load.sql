\set ON_ERROR_STOP on
SET ROLE fa_owner;
-- three collections of 200 documents: 10, 250, and 2,500 versions each
INSERT INTO message_pairs
SELECT md5(c.path || d || ':' || v)::uuid, c.path, 'doc' || lpad(d::text, 4, '0'), 'PUT',
       CASE WHEN v = 1 THEN '00000000-0000-0000-0000-000000000000'::uuid
            ELSE md5(c.path || d || ':' || (v - 1))::uuid END,
       timestamptz '2026-01-01 00:00:00+00' + (v * 200 + d) * interval '1 second',
       ''::bytea, convert_to(repeat('x', 300), 'UTF8')
FROM (VALUES ('/v10/', 10), ('/v250/', 250), ('/v2500/', 2500)) AS c(path, versions),
     generate_series(1, 200) d,
     LATERAL generate_series(1, c.versions) v;
ANALYZE message_pairs;
SELECT path, count(*) AS pairs, count(DISTINCT name) AS documents
FROM message_pairs WHERE path LIKE '/v%' GROUP BY path ORDER BY pairs;
