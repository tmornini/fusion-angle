// The nil root, one genesis statement at ensureTable.

import {
    NIL_IDENTIFIER,
    generateIdentifier,
} from '../shared/identifier.ts';
import type { StatementBind }
    from '../shared/ledger-statement.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import { notifyPayload } from './advisory-lock.ts';

export const DATE_PLACEHOLDER =
    'Thu, 01 Jan 1970 00:00:00 GMT';

const ROOT_PATH = '/migrations/';
const ROOT_NAME = '0000-root';
const ZERO_SHA =
    'e3b0c44298fc1c149afbf4c8996fb924'
    + '27ae41e4649b934ca495991b7852b855';

export function mintRootBind(): StatementBind {
    return rootBind(generateIdentifier());
}

export function rootBind(
    operationId: string,
): StatementBind {
    const wire = 'HTTP/1.1 201 \r\n'
        + 'content-length: 64\r\n'
        + 'date: ' + DATE_PLACEHOLDER + '\r\n'
        + 'etag: "' + NIL_IDENTIFIER + '"\r\n'
        + 'operation-id: ' + operationId + '\r\n'
        + '\r\n'
        + ZERO_SHA;
    const mark = '\r\ndate: ';
    const valueAt = wire.indexOf(mark) + mark.length;
    const bytes = Octets.fromLatin1(wire).asBytes();
    const zeros = new Uint8Array(16);
    return {
        id: NIL_IDENTIFIER,
        operationId,
        path: ROOT_PATH,
        name: ROOT_NAME,
        requesterIdentityId: 'fa_owner',
        method: 'PUT',
        request: new Uint8Array(0),
        requestSalt: zeros,
        secret: new Uint8Array(0),
        responsePrefix: bytes.slice(0, valueAt),
        responseSuffix: bytes.slice(valueAt + 29),
        responseSalt: zeros.slice(),
        ifMatch: null,
        notify: notifyPayload({
            kind: 'scoped',
            organizationIds: [],
            identityIds: ['fa_owner'],
        }),
    };
}
