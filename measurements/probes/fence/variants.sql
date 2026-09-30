\set VERBOSITY terse
SET ROLE ledger_owner;
-- one hot document: 5,000 versions
INSERT INTO message_pairs
SELECT gen_random_uuid(), '/big/', 'b', 'PUT', gen_random_uuid(),
       'req', 'sec',
       timestamptz '2026-04-01' + v * interval '1 second',
       convert_to(repeat('z', 600), 'UTF8')
FROM generate_series(1, 5000) v;
ANALYZE message_pairs;
CREATE VIEW ledger_plain AS
SELECT p.* FROM message_pairs p
WHERE NOT (p.name = 'pii' AND EXISTS (
    SELECT 1 FROM message_pairs d
    WHERE d.path = p.path AND d.name = p.name
      AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p.response_at, p.id)));
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON ledger_plain TO ledger_app;
-- RLS variant: predicate behind a definer function
CREATE FUNCTION pii_erased(p_path text, p_name text,
    p_at timestamptz, p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
RETURN p_name = 'pii' AND EXISTS (
    SELECT 1 FROM public.message_pairs d
    WHERE d.path = p_path AND d.name = p_name
      AND d.method = 'DELETE'
      AND (d.response_at, d.id) > (p_at, p_id));
ALTER TABLE message_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_select ON message_pairs FOR SELECT TO ledger_app
    USING (NOT pii_erased(path, name, response_at, id));
GRANT SELECT (id, path, name, method, supersedes, response_at, response)
    ON message_pairs TO ledger_app;
RESET ROLE;
