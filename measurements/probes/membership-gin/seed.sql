-- Schema text is POSTGRES_SCHEMA as printed.
-- The timed statement is below the marker.
\set ON_ERROR_STOP on
\pset pager off

CREATE TABLE IF NOT EXISTS fa_message_pairs (
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
);

CREATE TABLE IF NOT EXISTS schema_marker (
    "only" boolean PRIMARY KEY CHECK ("only")
);

CREATE OR REPLACE FUNCTION fa_imf_fixdate(
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
);

CREATE OR REPLACE FUNCTION fa_pair_root(
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
);

CREATE OR REPLACE FUNCTION fa_message_body_bytes(
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
);

CREATE OR REPLACE FUNCTION fa_message_body_json(
    response bytea
)
RETURNS jsonb
IMMUTABLE STRICT PARALLEL SAFE LANGUAGE plpgsql
AS $$
DECLARE
    split_at integer := position(
        E'\r\n\r\n'::bytea IN response
    );
BEGIN
    IF split_at = 0 THEN
        RETURN NULL;
    END IF;
    IF position(
        E'\r\ncontent-type: application/json\r\n'::bytea
        IN E'\r\n'::bytea
            || substring(response FROM 1 FOR split_at - 1)
            || E'\r\n'::bytea
    ) = 0 THEN
        RETURN NULL;
    END IF;
    RETURN convert_from(
        substring(response FROM split_at + 4), 'UTF8'
    )::jsonb;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION fa_request_id_of(
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
);

CREATE INDEX IF NOT EXISTS fa_message_pairs_document
    ON fa_message_pairs (path, name, response_at, id);
CREATE INDEX IF NOT EXISTS fa_message_pairs_collection
    ON fa_message_pairs (path, response_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS fa_message_pairs_succession
    ON fa_message_pairs (path, name, supersedes)
    WHERE method IN ('PUT', 'DELETE');
CREATE INDEX IF NOT EXISTS fa_message_pairs_request_id
    ON fa_message_pairs (fa_request_id_of(response));
CREATE INDEX IF NOT EXISTS fa_message_pairs_body
    ON fa_message_pairs
    USING gin (fa_message_body_json(response)
        jsonb_path_ops)
    WHERE path = '/invitations/';

-- gin-probe-insert
INSERT INTO fa_message_pairs (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method, response_at,
    request, request_salt, request_hash,
    request_secrets, request_secrets_hash,
    response, response_salt, response_hash,
    response_secrets, response_secrets_hash,
    pair_hash
)
SELECT
    (
        '10000000-0000-4000-8000-' || lpad(
            ((o.n - 1) * 100 + i.n)::text, 12, '0'
        )
    )::uuid,
    (
        '20000000-0000-4000-8000-' || lpad(
            ((o.n - 1) * 100 + i.n)::text, 12, '0'
        )
    )::uuid,
    '/invitations/',
    organization_id || ':' || ident_id,
    '00000000-0000-4000-8000-000000000000'::uuid,
    ident_id,
    'PUT',
    '2026-10-01T00:00:00Z',
    convert_to(
        'PUT /invitations/ HTTP/1.1' || E'\r\n\r\n',
        'UTF8'
    ),
    decode(repeat('00', 16), 'hex'),
    decode(repeat('11', 32), 'hex'),
    ''::bytea,
    decode(repeat('22', 32), 'hex'),
    convert_to(
        'HTTP/1.1 200 OK' || E'\r\n'
            || 'content-type: application/json'
            || E'\r\n\r\n'
            || jsonb_build_object(
                'organization_id', organization_id,
                'identity_id', ident_id,
                'state', 'accepted'
            )::text,
        'UTF8'
    ),
    decode(repeat('33', 16), 'hex'),
    decode(repeat('44', 32), 'hex'),
    ''::bytea,
    decode(repeat('55', 32), 'hex'),
    decode(repeat('66', 32), 'hex')
FROM generate_series(1, 100) AS o(n)
CROSS JOIN generate_series(1, 100) AS i(n)
CROSS JOIN LATERAL (
    SELECT
        '00000000-0000-4000-8000-'
            || lpad(o.n::text, 12, '0')
            AS organization_id,
        '00000000-0000-4000-8001-'
            || lpad(i.n::text, 12, '0') AS ident_id
) AS ids;
