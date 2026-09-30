\set ON_ERROR_STOP on
CREATE TABLE message_pairs (
    id uuid PRIMARY KEY, path text COLLATE "C" NOT NULL,
    name text COLLATE "C" NOT NULL, method text COLLATE "C" NOT NULL,
    supersedes uuid NOT NULL, response_at timestamptz NOT NULL,
    request bytea NOT NULL, response bytea NOT NULL);
CREATE INDEX message_pairs_document ON message_pairs (path, name, response_at, id);
INSERT INTO message_pairs
SELECT md5(c.path || d || ':' || v)::uuid, c.path, 'doc' || lpad(d::text, 5, '0'), 'PUT',
       gen_random_uuid(), timestamptz '2026-01-01' + (v * 100000 + d) * interval '1 second',
       ''::bytea, convert_to(repeat('x', 300), 'UTF8')
FROM (VALUES ('/d10000v1/', 10000, 1), ('/d2000v5/', 2000, 5), ('/d500v20/', 500, 20),
             ('/d200v50/', 200, 50), ('/d10000v3/', 10000, 3)) AS c(path, docs, versions),
     LATERAL generate_series(1, c.docs) d, LATERAL generate_series(1, c.versions) v;
ANALYZE message_pairs;
SELECT path, count(*) AS pairs, count(DISTINCT name) AS documents FROM message_pairs GROUP BY path ORDER BY path;
