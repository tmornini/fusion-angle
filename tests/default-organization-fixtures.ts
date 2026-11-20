import { generateIdentifier } from
    '../shared/identifier.ts';
import { framedRequest } from './http-fixtures.ts';

const BASE = 'http://localhost';

// Seeding a SET default rides the live PUT route.
export function putDefaultOrganization(
    token: string,
    identityId: string,
    organization: string,
): Request {
    return framedRequest(
        `${BASE}/identities/${identityId}`
            + '/default-organization', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token,
                'operation-id': generateIdentifier(),
            },
            body: JSON.stringify({
                organization_id: organization,
            }),
        });
}
