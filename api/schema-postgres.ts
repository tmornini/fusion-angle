// Compile-time Postgres DDL. The only input to sql.unsafe.
// Never concatenate request identifiers into these strings.

export const POSTGRES_REQUESTS_TABLE =
    String.raw`CREATE TABLE IF NOT EXISTS requests (
    id text COLLATE "C" PRIMARY KEY
        CONSTRAINT requests_id_chk
        CHECK (id ~ '^[0-9A-Za-z]{22}$'),
    uri_collection text COLLATE "C" NOT NULL
        CONSTRAINT requests_collection_chk
        CHECK (left(uri_collection, 1) = '/'
           AND right(uri_collection, 1) = '/'),
    uri_id text COLLATE "C" NOT NULL,
    at text COLLATE "C" NOT NULL
        CONSTRAINT requests_at_chk
        CHECK (at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    requester_identity_id text COLLATE "C" NOT NULL,
    message_hash text COLLATE "C" NOT NULL
        CONSTRAINT requests_hash_chk
        CHECK (message_hash ~ '^[0-9a-f]{64}$'),
    message bytea NOT NULL,
    method text COLLATE "C" NOT NULL
        CONSTRAINT requests_method_chk
        CHECK (method ~ '^[A-Z]+$'),
    operation_id text COLLATE "C" NOT NULL
        CONSTRAINT requests_operation_chk
        CHECK (operation_id ~ '^[0-9A-Za-z]{22}$')
);`;

export const POSTGRES_RESPONSES_TABLE =
    String.raw`CREATE TABLE IF NOT EXISTS responses (
    id text COLLATE "C" PRIMARY KEY
        CONSTRAINT responses_id_chk
        CHECK (id ~ '^[0-9A-Za-z]{22}$'),
    uri_collection text COLLATE "C" NOT NULL
        CONSTRAINT responses_collection_chk
        CHECK (left(uri_collection, 1) = '/'
           AND right(uri_collection, 1) = '/'),
    uri_id text COLLATE "C" NOT NULL,
    at text COLLATE "C" NOT NULL
        CONSTRAINT responses_at_chk
        CHECK (at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    version text COLLATE "C" NOT NULL
        CONSTRAINT responses_version_chk
        CHECK (version ~ '^[0-9a-f]{64}$'),
    message bytea NOT NULL,
    operation_id text COLLATE "C" NOT NULL
        CONSTRAINT responses_operation_chk
        CHECK (operation_id ~ '^[0-9A-Za-z]{22}$'),
    CONSTRAINT responses_request_fk
        FOREIGN KEY (id) REFERENCES requests (id)
        DEFERRABLE INITIALLY DEFERRED
);`;

export const POSTGRES_SCHEMA_MARKER_TABLE =
    String.raw`CREATE TABLE IF NOT EXISTS schema_marker (
    "only" boolean PRIMARY KEY CHECK ("only")
);`;

export const POSTGRES_MESSAGE_BODY_FUNCTION =
    String.raw`CREATE OR REPLACE FUNCTION message_body(message bytea)
RETURNS jsonb
IMMUTABLE STRICT PARALLEL SAFE LANGUAGE sql
RETURN CASE
    WHEN position(E'\r\n\r\n'::bytea IN message) = 0
        THEN NULL
    WHEN substring(message FROM
         position(E'\r\n\r\n'::bytea IN message) + 4)
         = ''::bytea
        THEN NULL
    ELSE convert_from(
         substring(message FROM
         position(E'\r\n\r\n'::bytea IN message) + 4),
         'UTF8')::jsonb
END;`;

export const POSTGRES_INDEXES =
    String.raw`CREATE INDEX IF NOT EXISTS requests_address
    ON requests (uri_collection, uri_id, at, id);
CREATE INDEX IF NOT EXISTS responses_address
    ON responses (uri_collection, uri_id, at, id);
CREATE INDEX IF NOT EXISTS requests_replay
    ON requests (message_hash);
CREATE INDEX IF NOT EXISTS requests_operation
    ON requests (operation_id);
CREATE INDEX IF NOT EXISTS responses_version
    ON responses (uri_collection, uri_id, version);
CREATE INDEX IF NOT EXISTS responses_operation
    ON responses (operation_id);
CREATE INDEX IF NOT EXISTS responses_body
    ON responses
    USING gin (message_body(message) jsonb_path_ops);`;

export const POSTGRES_SCHEMA_STATEMENTS = [
    POSTGRES_REQUESTS_TABLE,
    POSTGRES_RESPONSES_TABLE,
    POSTGRES_SCHEMA_MARKER_TABLE,
    POSTGRES_MESSAGE_BODY_FUNCTION,
    POSTGRES_INDEXES,
] as const;

export const POSTGRES_SCHEMA =
    POSTGRES_REQUESTS_TABLE
    + '\n\n'
    + POSTGRES_RESPONSES_TABLE
    + '\n\n'
    + POSTGRES_SCHEMA_MARKER_TABLE
    + '\n\n'
    + POSTGRES_MESSAGE_BODY_FUNCTION
    + '\n\n'
    + POSTGRES_INDEXES;
