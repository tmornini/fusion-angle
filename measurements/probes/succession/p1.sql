\c fa
\echo '--- P1a: fa_owner inserts the definition path THROUGH the api view (no grant on the view yet)'
SET ROLE fa_owner;
INSERT INTO api_pairs VALUES (gen_random_uuid(), '/definition/', 'schema', 'PUT',
  '00000000-0000-0000-0000-000000000000', clock_timestamp(), 'sql'::bytea, 'digest'::bytea);
RESET ROLE;
\echo '--- P1b: same, after the view owner grants fa_owner INSERT on the view'
SET ROLE fa_view_owner; GRANT INSERT ON api_pairs TO fa_owner; RESET ROLE;
SET ROLE fa_owner;
INSERT INTO api_pairs VALUES (gen_random_uuid(), '/definition/', 'schema', 'PUT',
  '00000000-0000-0000-0000-000000000000', clock_timestamp(), 'sql'::bytea, 'digest'::bytea);
\echo '--- P1c: fa_owner inserts an ORDINARY path through the api view (allowed by the policy)'
INSERT INTO api_pairs VALUES (gen_random_uuid(), '/ideas/', 'a', 'PUT',
  '00000000-0000-0000-0000-000000000000', clock_timestamp(), ''::bytea, 'x'::bytea);
\echo '--- P1d: fa_owner inserts the definition path INTO THE TABLE'
INSERT INTO message_pairs VALUES (gen_random_uuid(), '/definition/', 'schema', 'PUT',
  '00000000-0000-0000-0000-000000000000', clock_timestamp(), 'sql'::bytea, 'digest'::bytea);
RESET ROLE;
\echo '--- P1e: a member of fa_api reads the definition head through the view: response yes, request no'
SET SESSION AUTHORIZATION api_login;
SELECT path, name, convert_from(response,'UTF8') AS response FROM api_pairs WHERE path='/definition/';
SELECT request FROM api_pairs WHERE path='/definition/';
RESET SESSION AUTHORIZATION;
