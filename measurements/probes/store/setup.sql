-- Item 0 decision 2. Three homes for the same INSERT, on the
-- row-policy load: 262,000 rows, one document at 50,000
-- versions (/huge/ h) and one at 10 (/c77/ n7777).
-- Postgres 18, tmpfs, as compose runs it.
\set ON_ERROR_STOP on
\pset pager off

CREATE ROLE fa_owner NOLOGIN;
CREATE ROLE fa_api NOLOGIN;
GRANT ALL ON SCHEMA public TO fa_owner;
GRANT USAGE ON SCHEMA public TO fa_api;

SET ROLE fa_owner;

CREATE FUNCTION fa_net(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN length(t)::text || ':' || t || ',';

CREATE FUNCTION fa_leaf(salt bytea, bytes bytea) RETURNS bytea
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN sha256(salt || bytes);

-- Envelope columns then the three leaves, DDL order, netstring
-- of canonical text. The stamp is UTC with six digits, so the
-- string does not depend on DateStyle or TimeZone.
CREATE FUNCTION fa_pair_root(
    id uuid, operation_id uuid, path text, name text,
    supersedes uuid, requester_identity_id text, method text,
    response_at timestamptz,
    request_hash bytea, secret_hash bytea, response_hash bytea
) RETURNS bytea
LANGUAGE sql IMMUTABLE PARALLEL SAFE
RETURN sha256(convert_to(
    fa_net(id::text)
    || fa_net(operation_id::text)
    || fa_net(path)
    || fa_net(name)
    || fa_net(supersedes::text)
    || fa_net(requester_identity_id)
    || fa_net(method)
    || fa_net(to_char(response_at AT TIME ZONE 'UTC',
         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
    || fa_net(encode(request_hash, 'hex'))
    || fa_net(encode(secret_hash, 'hex'))
    || fa_net(encode(response_hash, 'hex')),
    'UTF8'));

CREATE TABLE pairs_none (
    id uuid PRIMARY KEY,
    operation_id uuid NOT NULL,
    path text COLLATE "C" NOT NULL,
    name text COLLATE "C" NOT NULL,
    supersedes uuid NOT NULL,
    requester_identity_id text COLLATE "C" NOT NULL,
    method text COLLATE "C" NOT NULL,
    response_at timestamptz NOT NULL,
    request bytea NOT NULL,
    request_salt bytea NOT NULL
        CHECK (octet_length(request_salt) = 16),
    request_hash bytea NOT NULL
        CHECK (octet_length(request_hash) = 32),
    secret bytea NOT NULL,
    secret_salt bytea NOT NULL
        CHECK (octet_length(secret_salt) = 16),
    secret_hash bytea NOT NULL
        CHECK (octet_length(secret_hash) = 32),
    response bytea NOT NULL,
    response_salt bytea NOT NULL
        CHECK (octet_length(response_salt) = 16),
    response_hash bytea NOT NULL
        CHECK (octet_length(response_hash) = 32),
    pair_hash bytea NOT NULL
        CHECK (octet_length(pair_hash) = 32)
);

CREATE INDEX pairs_none_document
    ON pairs_none (path, name, response_at, id);
CREATE UNIQUE INDEX pairs_none_succession
    ON pairs_none (path, name, supersedes)
    WHERE method IN ('PUT', 'DELETE');

-- The q2setup load, widened to the item-0 row. Hashes are
-- the right length and not real; the timed statement is
-- what computes them.
INSERT INTO pairs_none
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001'::uuid,
       '/c' || (d / 100) || '/', 'n' || d,
       gen_random_uuid(), 'identity', 'PUT',
       timestamptz '2026-02-01' + (d * 10 + v) * interval '1 second',
       'req', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '7', decode('ffeeddccbbaa99887766554433221100', 'hex'),
       decode(repeat('cd', 32), 'hex'),
       decode(repeat('ef', 32), 'hex')
FROM generate_series(1, 20000) d, generate_series(1, 10) v;

INSERT INTO pairs_none
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001'::uuid,
       '/identities/p' || d || '/', 'pii',
       gen_random_uuid(), 'identity', 'PUT',
       timestamptz '2026-03-01' + (d * 10 + v) * interval '1 second',
       'req', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '7', decode('ffeeddccbbaa99887766554433221100', 'hex'),
       decode(repeat('cd', 32), 'hex'),
       decode(repeat('ef', 32), 'hex')
FROM generate_series(1, 2000) d, generate_series(1, 3) v;

INSERT INTO pairs_none
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001'::uuid,
       '/identities/p' || d || '/', 'pii',
       gen_random_uuid(), 'identity', 'DELETE',
       timestamptz '2026-03-01' + (d * 10 + 9) * interval '1 second',
       'req', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '', decode('ffeeddccbbaa99887766554433221100', 'hex'),
       decode(repeat('cd', 32), 'hex'),
       decode(repeat('ef', 32), 'hex')
FROM generate_series(1, 1000) d;

INSERT INTO pairs_none
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001'::uuid,
       '/big/', 'b', gen_random_uuid(), 'identity', 'PUT',
       timestamptz '2026-04-01' + v * interval '1 second',
       'req', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '7', decode('ffeeddccbbaa99887766554433221100', 'hex'),
       decode(repeat('cd', 32), 'hex'),
       decode(repeat('ef', 32), 'hex')
FROM generate_series(1, 5000) v;

INSERT INTO pairs_none
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001'::uuid,
       '/huge/', 'h', gen_random_uuid(), 'identity', 'PUT',
       timestamptz '2026-05-01' + v * interval '1 second',
       'req', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '', decode('00112233445566778899aabbccddeeff', 'hex'),
       decode(repeat('ab', 32), 'hex'),
       '7', decode('ffeeddccbbaa99887766554433221100', 'hex'),
       decode(repeat('cd', 32), 'hex'),
       decode(repeat('ef', 32), 'hex')
FROM generate_series(1, 50000) v;

ANALYZE pairs_none;

CREATE TABLE pairs_trig (LIKE pairs_none INCLUDING ALL);
INSERT INTO pairs_trig SELECT * FROM pairs_none;
ANALYZE pairs_trig;

CREATE TABLE pairs_grant (LIKE pairs_none INCLUDING ALL);
INSERT INTO pairs_grant SELECT * FROM pairs_none;
ANALYZE pairs_grant;

-- Trigger candidate: fa_owner's BEFORE INSERT mints the
-- stamp and the four digests and refuses a supersedes that
-- is not this document's head. The honest statement still
-- selects that head; the trigger reads it again.
CREATE FUNCTION fa_mint_trig() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    head_id uuid;
    head_at timestamptz;
BEGIN
    SELECT p.id, p.response_at INTO head_id, head_at
    FROM pairs_trig p
    WHERE p.path = NEW.path AND p.name = NEW.name
      AND p.method IN ('PUT', 'DELETE')
    ORDER BY p.response_at DESC, p.id DESC
    LIMIT 1;
    IF head_id IS DISTINCT FROM NEW.supersedes THEN
        RAISE EXCEPTION 'supersedes is not the head';
    END IF;
    NEW.response_at := greatest(
        clock_timestamp(), head_at + interval '1 microsecond');
    NEW.request_hash := fa_leaf(NEW.request_salt, NEW.request);
    NEW.secret_hash := fa_leaf(NEW.secret_salt, NEW.secret);
    NEW.response_hash := fa_leaf(NEW.response_salt, NEW.response);
    NEW.pair_hash := fa_pair_root(
        NEW.id, NEW.operation_id, NEW.path, NEW.name,
        NEW.supersedes, NEW.requester_identity_id, NEW.method,
        NEW.response_at, NEW.request_hash, NEW.secret_hash,
        NEW.response_hash);
    RETURN NEW;
END;
$$;

CREATE TRIGGER fa_mint_trig
    BEFORE INSERT ON pairs_trig
    FOR EACH ROW EXECUTE FUNCTION fa_mint_trig();

CREATE FUNCTION fa_mint_grant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    head_id uuid;
    head_at timestamptz;
BEGIN
    SELECT p.id, p.response_at INTO head_id, head_at
    FROM pairs_grant p
    WHERE p.path = NEW.path AND p.name = NEW.name
      AND p.method IN ('PUT', 'DELETE')
    ORDER BY p.response_at DESC, p.id DESC
    LIMIT 1;
    IF head_id IS DISTINCT FROM NEW.supersedes THEN
        RAISE EXCEPTION 'supersedes is not the head';
    END IF;
    NEW.response_at := greatest(
        clock_timestamp(), head_at + interval '1 microsecond');
    NEW.request_hash := fa_leaf(NEW.request_salt, NEW.request);
    NEW.secret_hash := fa_leaf(NEW.secret_salt, NEW.secret);
    NEW.response_hash := fa_leaf(NEW.response_salt, NEW.response);
    NEW.pair_hash := fa_pair_root(
        NEW.id, NEW.operation_id, NEW.path, NEW.name,
        NEW.supersedes, NEW.requester_identity_id, NEW.method,
        NEW.response_at, NEW.request_hash, NEW.secret_hash,
        NEW.response_hash);
    RETURN NEW;
END;
$$;

CREATE TRIGGER fa_mint_grant
    BEFORE INSERT ON pairs_grant
    FOR EACH ROW EXECUTE FUNCTION fa_mint_grant();

GRANT SELECT, INSERT ON pairs_none, pairs_trig TO fa_api;
GRANT SELECT ON pairs_grant TO fa_api;
GRANT INSERT (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method,
    request, request_salt, secret, secret_salt,
    response, response_salt
) ON pairs_grant TO fa_api;

RESET ROLE;

SELECT count(*) AS rows_none FROM pairs_none;
SELECT count(*) AS versions_huge FROM pairs_none
WHERE path = '/huge/' AND name = 'h';
SELECT count(*) AS versions_shallow FROM pairs_none
WHERE path = '/c77/' AND name = 'n7777';
SELECT version();
