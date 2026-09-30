\pset pager off
\set VERBOSITY terse
\echo ##### leakproof flags of the operators the app's reads use
SELECT proname, proleakproof FROM pg_proc
WHERE proname IN ('texteq','uuid_eq','jsonb_contains','textlike',
                  'timestamptz_lt','text_lt')
ORDER BY proname;
SET ROLE ledger_owner;
\echo ##### load: 20,000 documents x 10 versions in one collection-per-100
INSERT INTO message_pairs
SELECT gen_random_uuid(),
       '/c' || (d / 100) || '/',
       'n' || d,
       'PUT',
       gen_random_uuid(),
       'req', 'sec',
       timestamptz '2026-02-01' + (d * 10 + v) * interval '1 second',
       convert_to(repeat('x', 600), 'UTF8')
FROM generate_series(1, 20000) d, generate_series(1, 10) v;
\echo ##### plus 2,000 pii documents: 3 PUTs each, half then DELETEd
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/identities/p' || d || '/', 'pii', 'PUT',
       gen_random_uuid(), 'req', 'sec',
       timestamptz '2026-03-01' + (d * 10 + v) * interval '1 second',
       convert_to(repeat('y', 300), 'UTF8')
FROM generate_series(1, 2000) d, generate_series(1, 3) v;
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/identities/p' || d || '/', 'pii', 'DELETE',
       gen_random_uuid(), 'req', 'sec',
       timestamptz '2026-03-01' + (d * 10 + 9) * interval '1 second',
       convert_to('', 'UTF8')
FROM generate_series(1, 1000) d;
ANALYZE message_pairs;
SELECT count(*) AS table_rows FROM message_pairs;
SELECT count(*) AS visible_rows FROM ledger;
RESET ROLE;
