\pset pager off
\set VERBOSITY terse
CREATE ROLE fa_owner NOLOGIN;
CREATE ROLE fa_api NOLOGIN;
CREATE ROLE host_user LOGIN;       -- a deployment's login, member of fa_api
CREATE ROLE stranger LOGIN;        -- some other login in the same cluster
GRANT fa_api TO host_user;
CREATE DATABASE fa OWNER fa_owner;
\c fa
GRANT ALL ON SCHEMA public TO fa_owner;
SET ROLE fa_owner;
CREATE TABLE message_pairs (id int PRIMARY KEY, request text NOT NULL,
                            response text NOT NULL);
CREATE VIEW api_pairs AS SELECT * FROM message_pairs;
GRANT INSERT ON api_pairs TO fa_api;
GRANT SELECT (id, response) ON api_pairs TO fa_api;
RESET ROLE;
