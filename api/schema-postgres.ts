// Compile-time Postgres DDL. The only input to sql.unsafe.
// Never concatenate request identifiers into these strings.

export const POSTGRES_MESSAGE_PAIRS_TABLE =
    String.raw`CREATE TABLE IF NOT EXISTS fa_message_pairs (
    id uuid PRIMARY KEY,
    operation_id uuid NOT NULL,
    path text COLLATE "C" NOT NULL
        CONSTRAINT fa_message_pairs_path_chk
        CHECK (left(path, 1) = '/'
           AND right(path, 1) = '/'),
    name text COLLATE "C" NOT NULL,
    supersedes uuid NOT NULL,
    requester_identity_id text COLLATE "C" NOT NULL,
    method text COLLATE "C" NOT NULL
        CONSTRAINT fa_message_pairs_method_chk
        CHECK (method ~ '^[A-Z]+$'),
    response_at timestamptz NOT NULL,
    request bytea NOT NULL,
    request_salt bytea NOT NULL
        CONSTRAINT fa_message_pairs_request_salt_chk
        CHECK (octet_length(request_salt) = 16),
    request_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_request_hash_chk
        CHECK (octet_length(request_hash) = 32),
    request_secrets bytea NOT NULL,
    request_secrets_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_request_secrets_hash_chk
        CHECK (octet_length(request_secrets_hash) = 32),
    response bytea NOT NULL,
    response_salt bytea NOT NULL
        CONSTRAINT fa_message_pairs_response_salt_chk
        CHECK (octet_length(response_salt) = 16),
    response_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_response_hash_chk
        CHECK (octet_length(response_hash) = 32),
    response_secrets bytea NOT NULL,
    response_secrets_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_response_secrets_hash_chk
        CHECK (octet_length(response_secrets_hash) = 32),
    pair_hash bytea NOT NULL
        CONSTRAINT fa_message_pairs_pair_hash_chk
        CHECK (octet_length(pair_hash) = 32)
);`;

export const POSTGRES_SCHEMA_MARKER_TABLE =
    String.raw`CREATE TABLE IF NOT EXISTS schema_marker (
    "only" boolean PRIMARY KEY CHECK ("only")
);`;

// Weekday and month are fixed English. to_char
// Dy and Mon follow lc_time, so those fields are
// array lookups. The stamp is read in UTC.
export const POSTGRES_FA_IMF_FIXDATE_FUNCTION =
    String.raw`CREATE OR REPLACE FUNCTION fa_imf_fixdate(
    stamp timestamptz
)
RETURNS text
IMMUTABLE PARALLEL SAFE LANGUAGE sql
RETURN (
    SELECT (ARRAY[
            'Sun', 'Mon', 'Tue', 'Wed',
            'Thu', 'Fri', 'Sat'
        ])[
            (EXTRACT(DOW FROM utc)::integer + 1)
        ]
        || ', '
        || to_char(utc, 'DD')
        || ' '
        || (ARRAY[
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ])[EXTRACT(MONTH FROM utc)::integer]
        || ' '
        || to_char(utc, 'YYYY')
        || ' '
        || to_char(utc, 'HH24:MI:SS')
        || ' GMT'
    FROM (
        SELECT stamp AT TIME ZONE 'UTC' AS utc
    ) AS zoned
);`;

export const POSTGRES_FA_PAIR_ROOT_FUNCTION =
    String.raw`CREATE OR REPLACE FUNCTION fa_pair_root(
    id uuid,
    operation_id uuid,
    path text,
    name text,
    supersedes uuid,
    requester_identity_id text,
    method text,
    response_at timestamptz,
    request_hash bytea,
    request_secrets_hash bytea,
    response_hash bytea,
    response_secrets_hash bytea
)
RETURNS bytea
IMMUTABLE PARALLEL SAFE LANGUAGE sql
RETURN (
    SELECT sha256(convert_to(
        octet_length(convert_to(
            id_text, 'UTF8'
        ))::text
            || ':' || id_text || ','
        || octet_length(convert_to(
            operation_text, 'UTF8'
        ))::text
            || ':' || operation_text || ','
        || octet_length(convert_to(
            path_text, 'UTF8'
        ))::text
            || ':' || path_text || ','
        || octet_length(convert_to(
            name_text, 'UTF8'
        ))::text
            || ':' || name_text || ','
        || octet_length(convert_to(
            supersedes_text, 'UTF8'
        ))::text
            || ':' || supersedes_text || ','
        || octet_length(convert_to(
            requester_text, 'UTF8'
        ))::text
            || ':' || requester_text || ','
        || octet_length(convert_to(
            method_text, 'UTF8'
        ))::text
            || ':' || method_text || ','
        || octet_length(convert_to(
            stamp_text, 'UTF8'
        ))::text
            || ':' || stamp_text || ','
        || octet_length(convert_to(
            request_text, 'UTF8'
        ))::text
            || ':' || request_text || ','
        || octet_length(convert_to(
            request_secrets_text, 'UTF8'
        ))::text
            || ':' || request_secrets_text || ','
        || octet_length(convert_to(
            response_text, 'UTF8'
        ))::text
            || ':' || response_text || ','
        || octet_length(convert_to(
            response_secrets_text, 'UTF8'
        ))::text
            || ':' || response_secrets_text || ',',
        'UTF8'
    ))
    FROM (
        SELECT
            id::text AS id_text,
            operation_id::text AS operation_text,
            path AS path_text,
            name AS name_text,
            supersedes::text AS supersedes_text,
            requester_identity_id AS requester_text,
            method AS method_text,
            to_char(
                response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) AS stamp_text,
            encode(request_hash, 'hex') AS request_text,
            encode(request_secrets_hash, 'hex')
                AS request_secrets_text,
            encode(response_hash, 'hex')
                AS response_text,
            encode(response_secrets_hash, 'hex')
                AS response_secrets_text
    ) AS texts
);`;

export const POSTGRES_FA_MESSAGE_BODY_BYTES_FUNCTION =
    String.raw`CREATE OR REPLACE FUNCTION fa_message_body_bytes(
    message bytea
)
RETURNS bytea
IMMUTABLE STRICT PARALLEL SAFE LANGUAGE sql
RETURN (
    SELECT CASE
        WHEN split_at = 0 THEN ''::bytea
        ELSE substring(message FROM split_at + 4)
    END
    FROM (
        SELECT position(
            E'\r\n\r\n'::bytea IN message
        ) AS split_at
    ) AS located
);`;

// The header block is the bytes before CRLF CRLF,
// or the whole value when that separator is absent.
// The captured group is the line value, not the
// CRLF that introduces the line.
export const POSTGRES_FA_REQUEST_ID_OF_FUNCTION =
    String.raw`CREATE OR REPLACE FUNCTION fa_request_id_of(
    response bytea
)
RETURNS text
IMMUTABLE PARALLEL SAFE LANGUAGE sql
RETURN (
    SELECT substring(
        E'\r\n' || convert_from(header, 'UTF8')
        FROM E'\r\nrequest-id: ([^\r]*)'
    )
    FROM (
        SELECT CASE
            WHEN split_at = 0 THEN response
            ELSE substring(
                response FROM 1 FOR split_at - 1
            )
        END AS header
        FROM (
            SELECT position(
                E'\r\n\r\n'::bytea IN response
            ) AS split_at
        ) AS located
    ) AS block
);`;

export const POSTGRES_INDEXES =
    String.raw`CREATE INDEX IF NOT EXISTS fa_message_pairs_document
    ON fa_message_pairs (path, name, response_at, id);
CREATE INDEX IF NOT EXISTS fa_message_pairs_collection
    ON fa_message_pairs (path, response_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS fa_message_pairs_succession
    ON fa_message_pairs (path, name, supersedes)
    WHERE method IN ('PUT', 'DELETE');
CREATE INDEX IF NOT EXISTS fa_message_pairs_request_id
    ON fa_message_pairs (fa_request_id_of(response));`;

export const POSTGRES_SCHEMA_STATEMENTS = [
    POSTGRES_MESSAGE_PAIRS_TABLE,
    POSTGRES_SCHEMA_MARKER_TABLE,
    POSTGRES_FA_IMF_FIXDATE_FUNCTION,
    POSTGRES_FA_PAIR_ROOT_FUNCTION,
    POSTGRES_FA_MESSAGE_BODY_BYTES_FUNCTION,
    POSTGRES_FA_REQUEST_ID_OF_FUNCTION,
    POSTGRES_INDEXES,
] as const;

export const POSTGRES_SCHEMA =
    POSTGRES_MESSAGE_PAIRS_TABLE
    + '\n\n'
    + POSTGRES_SCHEMA_MARKER_TABLE
    + '\n\n'
    + POSTGRES_FA_IMF_FIXDATE_FUNCTION
    + '\n\n'
    + POSTGRES_FA_PAIR_ROOT_FUNCTION
    + '\n\n'
    + POSTGRES_FA_MESSAGE_BODY_BYTES_FUNCTION
    + '\n\n'
    + POSTGRES_FA_REQUEST_ID_OF_FUNCTION
    + '\n\n'
    + POSTGRES_INDEXES;
