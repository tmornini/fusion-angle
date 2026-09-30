\pset pager off
\set VERBOSITY terse
\echo ##### product roles: NOLOGIN, prefixed, hold the grants
CREATE ROLE fa_owner NOLOGIN;
CREATE ROLE fa_server NOLOGIN;
GRANT ALL ON SCHEMA public TO fa_owner;
SET ROLE fa_owner;
CREATE TABLE message_pairs (id int PRIMARY KEY, request text NOT NULL,
                            response text NOT NULL);
CREATE VIEW server_pairs WITH (security_barrier = true) AS
    SELECT * FROM message_pairs;
GRANT INSERT ON server_pairs TO fa_server;
GRANT SELECT (id, response) ON server_pairs TO fa_server;
RESET ROLE;
\echo ##### a host's login user: any name, no grants of its own
CREATE ROLE host_given_user LOGIN;
SET SESSION AUTHORIZATION host_given_user;
\echo --- P1 before membership
INSERT INTO server_pairs VALUES (1, 'req', 'res') RETURNING id;
RESET SESSION AUTHORIZATION;
GRANT fa_server TO host_given_user;
SET SESSION AUTHORIZATION host_given_user;
\echo --- P2 after GRANT fa_server TO host_given_user
INSERT INTO server_pairs VALUES (1, 'req', 'res') RETURNING id;
SELECT request FROM server_pairs;
RESET SESSION AUTHORIZATION;
\echo ##### P3 creating a role twice
CREATE ROLE fa_server NOLOGIN;
\echo ##### P4 the wipe: roles survive a schema drop
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SELECT rolname FROM pg_roles WHERE rolname LIKE 'fa\_%' ORDER BY 1;
\echo ##### P5 roles are cluster-wide: seen from another database
CREATE DATABASE some_other_app;
\c some_other_app
SELECT rolname FROM pg_roles WHERE rolname LIKE 'fa\_%' ORDER BY 1;
