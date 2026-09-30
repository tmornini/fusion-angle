\set ON_ERROR_STOP on
CREATE ROLE fa_owner NOLOGIN CREATEROLE;
CREATE DATABASE fa OWNER fa_owner;
\c fa
SET ROLE fa_owner;
CREATE ROLE fa_api NOLOGIN;
CREATE ROLE api_login LOGIN IN ROLE fa_api;
CREATE TABLE fa_message_pairs (
    id uuid PRIMARY KEY, path text COLLATE "C" NOT NULL,
    name text COLLATE "C" NOT NULL, method text COLLATE "C" NOT NULL,
    supersedes uuid NOT NULL, response_at timestamptz NOT NULL,
    request bytea NOT NULL, credential bytea NOT NULL, response bytea NOT NULL);
CREATE INDEX fa_message_pairs_document ON fa_message_pairs (path, name, response_at, id);
INSERT INTO fa_message_pairs VALUES ('00000000-0000-0000-0000-000000000000','/','root','PUT','00000000-0000-0000-0000-000000000000',clock_timestamp(),''::bytea,''::bytea,'root'::bytea);
CREATE VIEW fa_pii_deletes AS SELECT path, name, response_at FROM fa_message_pairs WHERE method = 'DELETE' AND name = 'pii' AND path LIKE '/identities/%';
ALTER TABLE fa_message_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY fa_api_reads ON fa_message_pairs FOR SELECT TO fa_api
    USING (NOT (name = 'pii' AND path LIKE '/identities/%' AND EXISTS (SELECT 1 FROM fa_pii_deletes d WHERE d.path = fa_message_pairs.path AND d.name = fa_message_pairs.name AND d.response_at > fa_message_pairs.response_at)));
CREATE POLICY fa_api_inserts ON fa_message_pairs FOR INSERT TO fa_api WITH CHECK (path <> '/definition/');
GRANT USAGE ON SCHEMA public TO fa_api;
GRANT INSERT ON fa_message_pairs TO fa_api;
GRANT SELECT (id, path, name, method, supersedes, response_at, response) ON fa_message_pairs TO fa_api;
GRANT SELECT ON fa_pii_deletes TO fa_api;
-- data: a PII pair and its DELETE, and an ordinary document
INSERT INTO fa_message_pairs VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','/identities/i1/','pii','PUT','00000000-0000-0000-0000-000000000000','2026-09-21 12:00:00+00',''::bytea,''::bytea,'name=Tony'::bytea),
 ('aaaaaaaa-0000-0000-0000-000000000002','/identities/i1/','pii','DELETE','aaaaaaaa-0000-0000-0000-000000000001','2026-09-21 12:00:10+00',''::bytea,''::bytea,''::bytea),
 ('bbbbbbbb-0000-0000-0000-000000000001','/ideas/','a','PUT','00000000-0000-0000-0000-000000000000','2026-09-21 12:00:00+00','secret-req'::bytea,'cookie'::bytea,'v1'::bytea);
RESET ROLE;
SELECT 'setup done' AS ok;
