// Compile-time Postgres DDL. The only input to sql.unsafe.
// Never concatenate request identifiers into these strings.

export const POSTGRES_PAIRS_TABLE =
    String.raw`CREATE TABLE IF NOT EXISTS pairs (
    id uuid PRIMARY KEY,
    uri_collection text COLLATE "C" NOT NULL
        CONSTRAINT pairs_collection_chk
        CHECK (left(uri_collection, 1) = '/'
           AND right(uri_collection, 1) = '/'),
    uri_id text COLLATE "C" NOT NULL,
    requester_identity_id text COLLATE "C" NOT NULL,
    method text COLLATE "C" NOT NULL
        CONSTRAINT pairs_method_chk
        CHECK (method ~ '^[A-Z]+$'),
    request_at text COLLATE "C" NOT NULL
        CONSTRAINT pairs_request_at_chk
        CHECK (request_at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    request_hash text COLLATE "C" NOT NULL
        CONSTRAINT pairs_request_hash_chk
        CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    request bytea NOT NULL,
    response_at text COLLATE "C" NOT NULL
        CONSTRAINT pairs_response_at_chk
        CHECK (response_at ~
        '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$'),
    version text COLLATE "C" NOT NULL
        CONSTRAINT pairs_version_chk
        CHECK (version ~ '^[0-9a-f]{64}$'),
    response bytea NOT NULL,
    operation_id uuid NOT NULL
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
    String.raw`CREATE INDEX IF NOT EXISTS pairs_address
    ON pairs (uri_collection, uri_id, response_at, id);
CREATE INDEX IF NOT EXISTS pairs_collection
    ON pairs (uri_collection, response_at, id);
CREATE INDEX IF NOT EXISTS pairs_replay
    ON pairs (request_hash);
CREATE INDEX IF NOT EXISTS pairs_version
    ON pairs (uri_collection, uri_id, version);
CREATE INDEX IF NOT EXISTS pairs_body
    ON pairs
    USING gin (message_body(response) jsonb_path_ops);`;

export const POSTGRES_SCHEMA_STATEMENTS = [
    POSTGRES_PAIRS_TABLE,
    POSTGRES_SCHEMA_MARKER_TABLE,
    POSTGRES_MESSAGE_BODY_FUNCTION,
    POSTGRES_INDEXES,
] as const;

export const POSTGRES_SCHEMA =
    POSTGRES_PAIRS_TABLE
    + '\n\n'
    + POSTGRES_SCHEMA_MARKER_TABLE
    + '\n\n'
    + POSTGRES_MESSAGE_BODY_FUNCTION
    + '\n\n'
    + POSTGRES_INDEXES;
