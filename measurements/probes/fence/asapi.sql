\pset pager off
\set VERBOSITY terse
\echo --- temp table
CREATE TEMP TABLE scratch (x int);
\echo --- function in temp schema
CREATE FUNCTION pg_temp.f() RETURNS int LANGUAGE sql RETURN 1;
\echo --- anonymous code block
DO $$ BEGIN PERFORM 1; END $$;
\echo --- table in public
CREATE TABLE public.mine (x int);
\echo --- new schema
CREATE SCHEMA mine;
\echo --- large object
SELECT lo_create(0) > 0 AS made_large_object;
\echo --- advisory lock
SELECT pg_advisory_lock(1) IS NOT NULL AS took_advisory_lock;
\echo --- become the owner
SET ROLE fa_owner;
\echo --- update, delete, truncate through the view
UPDATE api_pairs SET response = 'x';
DELETE FROM api_pairs;
TRUNCATE message_pairs;
\echo --- read role names and the view definition from the catalog
SELECT count(*) AS fa_roles_visible FROM pg_roles WHERE rolname LIKE 'fa\_%';
SELECT length(pg_get_viewdef('api_pairs'::regclass)) > 0 AS sees_view_text;
