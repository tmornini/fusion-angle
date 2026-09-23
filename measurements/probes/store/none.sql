WITH head AS (
    SELECT id, response_at
    FROM pairs_none
    WHERE path = :'path' AND name = :'name'
      AND method IN ('PUT', 'DELETE')
    ORDER BY response_at DESC, id DESC
    LIMIT 1
),
raw AS (
    SELECT gen_random_uuid() AS id,
           '00000000-0000-0000-0000-0000000000aa'::uuid
               AS operation_id,
           :'path' AS path,
           :'name' AS name,
           head.id AS supersedes,
           'identity' AS requester_identity_id,
           'PUT' AS method,
           greatest(clock_timestamp(),
               head.response_at + interval '1 microsecond')
               AS response_at,
           convert_to('req', 'UTF8') AS request,
           decode('00112233445566778899aabbccddeeff', 'hex')
               AS request_salt,
           convert_to('', 'UTF8') AS secret,
           decode('00112233445566778899aabbccddeeff', 'hex')
               AS secret_salt,
           convert_to(repeat('x', 300), 'UTF8') AS response,
           decode('ffeeddccbbaa99887766554433221100', 'hex')
               AS response_salt
    FROM head
),
mint AS (
    SELECT raw.*,
           fa_leaf(request_salt, request) AS request_hash,
           fa_leaf(secret_salt, secret) AS secret_hash,
           fa_leaf(response_salt, response) AS response_hash
    FROM raw
)
INSERT INTO pairs_none (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method, response_at,
    request, request_salt, request_hash,
    secret, secret_salt, secret_hash,
    response, response_salt, response_hash, pair_hash
)
SELECT id, operation_id, path, name, supersedes,
       requester_identity_id, method, response_at,
       request, request_salt, request_hash,
       secret, secret_salt, secret_hash,
       response, response_salt, response_hash,
       fa_pair_root(
           id, operation_id, path, name, supersedes,
           requester_identity_id, method, response_at,
           request_hash, secret_hash, response_hash)
FROM mint
