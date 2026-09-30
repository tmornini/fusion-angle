\set ON_ERROR_STOP on
CREATE ROLE fa_owner NOLOGIN CREATEROLE;
CREATE DATABASE fa OWNER fa_owner;
\c fa
SET ROLE fa_owner;
CREATE ROLE fa_api NOLOGIN;
CREATE ROLE fa_view_owner NOLOGIN;
CREATE ROLE api_login LOGIN IN ROLE fa_api;
CREATE TABLE message_pairs (
    id uuid PRIMARY KEY,
    path text COLLATE "C" NOT NULL,
    name text COLLATE "C" NOT NULL,
    method text COLLATE "C" NOT NULL,
    supersedes uuid NOT NULL,
    response_at timestamptz NOT NULL,
    request bytea NOT NULL,
    response bytea NOT NULL
);
CREATE INDEX message_pairs_document
    ON message_pairs (path, name, response_at, id);
CREATE UNIQUE INDEX message_pairs_succession
    ON message_pairs (path, name, supersedes)
    WHERE method IN ('PUT', 'DELETE');
-- the ROOT row
INSERT INTO message_pairs VALUES (
    '00000000-0000-0000-0000-000000000000', '/', 'root', 'PUT',
    '00000000-0000-0000-0000-000000000000',
    clock_timestamp(), ''::bytea, 'root'::bytea);
CREATE VIEW pii_deletes AS
    SELECT path, name, response_at FROM message_pairs
    WHERE method = 'DELETE' AND name = 'pii'
      AND path LIKE '/identities/%';
ALTER TABLE message_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY hide_removed_pii ON message_pairs
    FOR SELECT TO fa_view_owner
    USING (NOT (name = 'pii' AND path LIKE '/identities/%'
        AND EXISTS (SELECT 1 FROM pii_deletes d
            WHERE d.path = message_pairs.path
              AND d.name = message_pairs.name
              AND d.response_at > message_pairs.response_at)));
CREATE POLICY admit_inserts ON message_pairs
    FOR INSERT TO fa_view_owner
    WITH CHECK (path <> '/definition/');
GRANT SELECT, INSERT ON message_pairs TO fa_view_owner;
GRANT SELECT ON pii_deletes TO fa_view_owner;
GRANT CREATE ON SCHEMA public TO fa_view_owner;
SET ROLE fa_view_owner;
CREATE VIEW api_pairs AS SELECT * FROM message_pairs;
RESET ROLE;
SET ROLE fa_owner;
REVOKE CREATE ON SCHEMA public FROM fa_view_owner;
GRANT USAGE ON SCHEMA public TO fa_api, fa_view_owner;
SET ROLE fa_view_owner;
GRANT INSERT ON api_pairs TO fa_api;
GRANT SELECT (id, path, name, method, supersedes,
    response_at, response) ON api_pairs TO fa_api;
RESET ROLE;
SELECT 'setup done' AS ok;
