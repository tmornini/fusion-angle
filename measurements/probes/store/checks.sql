\set ON_ERROR_STOP off
\pset pager off
SET ROLE fa_api;

\echo --- grant: naming response_at must fail
INSERT INTO pairs_grant (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method, response_at,
    request, request_salt, secret, secret_salt,
    response, response_salt
)
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-0000000000aa'::uuid,
       '/huge/', 'h', id, 'identity', 'PUT', clock_timestamp(),
       'req', decode('00112233445566778899aabbccddeeff', 'hex'),
       '', decode('00112233445566778899aabbccddeeff', 'hex'),
       'x', decode('ffeeddccbbaa99887766554433221100', 'hex')
FROM pairs_grant
WHERE path = '/huge/' AND name = 'h'
ORDER BY response_at DESC, id DESC
LIMIT 1;

\echo --- trigger: invented supersedes must fail
INSERT INTO pairs_trig (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method,
    request, request_salt, secret, secret_salt,
    response, response_salt
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-0000000000aa',
    '/huge/', 'h', gen_random_uuid(), 'identity', 'PUT',
    'req', decode('00112233445566778899aabbccddeeff', 'hex'),
    '', decode('00112233445566778899aabbccddeeff', 'hex'),
    convert_to(repeat('x', 300), 'UTF8'),
    decode('ffeeddccbbaa99887766554433221100', 'hex')
);

\echo --- trigger: honest insert, then what landed
BEGIN;
WITH head AS (
    SELECT id, response_at FROM pairs_trig
    WHERE path = '/huge/' AND name = 'h'
      AND method IN ('PUT', 'DELETE')
    ORDER BY response_at DESC, id DESC LIMIT 1
)
INSERT INTO pairs_trig (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method,
    request, request_salt, secret, secret_salt,
    response, response_salt
)
SELECT '00000000-0000-0000-0000-0000000000bb',
       '00000000-0000-0000-0000-0000000000aa',
       '/huge/', 'h', head.id, 'identity', 'PUT',
       convert_to('req', 'UTF8'),
       decode('00112233445566778899aabbccddeeff', 'hex'),
       ''::bytea,
       decode('00112233445566778899aabbccddeeff', 'hex'),
       convert_to(repeat('x', 300), 'UTF8'),
       decode('ffeeddccbbaa99887766554433221100', 'hex')
FROM head
RETURNING
    octet_length(request_hash) AS req_n,
    octet_length(pair_hash) AS root_n,
    response_at > (SELECT max(response_at) FROM pairs_trig p
        WHERE p.path = '/huge/' AND p.name = 'h'
          AND p.id <> '00000000-0000-0000-0000-0000000000bb')
        AS stamp_after_head;
ROLLBACK;

\echo --- grant: honest insert lands
BEGIN;
WITH head AS (
    SELECT id FROM pairs_grant
    WHERE path = '/huge/' AND name = 'h'
      AND method IN ('PUT', 'DELETE')
    ORDER BY response_at DESC, id DESC LIMIT 1
)
INSERT INTO pairs_grant (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method,
    request, request_salt, secret, secret_salt,
    response, response_salt
)
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-0000000000aa',
       '/huge/', 'h', head.id, 'identity', 'PUT',
       convert_to('req', 'UTF8'),
       decode('00112233445566778899aabbccddeeff', 'hex'),
       ''::bytea,
       decode('00112233445566778899aabbccddeeff', 'hex'),
       convert_to(repeat('x', 300), 'UTF8'),
       decode('ffeeddccbbaa99887766554433221100', 'hex')
FROM head
RETURNING octet_length(response_hash) AS resp_n,
          octet_length(pair_hash) AS root_n;
ROLLBACK;
