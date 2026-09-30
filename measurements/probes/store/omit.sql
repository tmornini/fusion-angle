WITH head AS (
    SELECT id
    FROM :ident
    WHERE path = :'path' AND name = :'name'
      AND method IN ('PUT', 'DELETE')
    ORDER BY response_at DESC, id DESC
    LIMIT 1
)
INSERT INTO :ident (
    id, operation_id, path, name, supersedes,
    requester_identity_id, method,
    request, request_salt, secret, secret_salt,
    response, response_salt
)
SELECT gen_random_uuid(),
       '00000000-0000-0000-0000-0000000000aa'::uuid,
       :'path', :'name', head.id, 'identity', 'PUT',
       convert_to('req', 'UTF8'),
       decode('00112233445566778899aabbccddeeff', 'hex'),
       convert_to('', 'UTF8'),
       decode('00112233445566778899aabbccddeeff', 'hex'),
       convert_to(repeat('x', 300), 'UTF8'),
       decode('ffeeddccbbaa99887766554433221100', 'hex')
FROM head
