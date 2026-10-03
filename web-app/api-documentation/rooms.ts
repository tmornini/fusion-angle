export interface ApiDocRoom {
    readonly hash: string;
    readonly verb: string;
    readonly uri: string;
    readonly body: string;
    readonly headers: readonly string[];
    readonly statuses: readonly string[];
}

export interface ApiDocStatus {
    readonly hash: string;
    readonly code: string;
    readonly body: string;
}

export const API_DOC_ROOMS:
    readonly ApiDocRoom[] = [
    {
        hash: 'delete/identities/id/pii',
        verb: 'DELETE',
        uri: '/api/identities/:id/pii',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'delete/identities/id/registration',
        verb: 'DELETE',
        uri: '/api/identities/:id/registration',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'delete/organizations/id/flows/id/records/frid',
        verb: 'DELETE',
        uri: '/api/organizations/:id/flows/:id/records/:frid',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'delete/organizations/id/flows/id/tags/name',
        verb: 'DELETE',
        uri: '/api/organizations/:id/flows/:id/tags/:name',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'delete/organizations/id/projects/id/flows/pfid',
        verb: 'DELETE',
        uri: '/api/organizations/:id/projects/:id/flows/:pfid',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'delete/organizations/id/work-orders/id/claim',
        verb: 'DELETE',
        uri: '/api/organizations/:id/work-orders/:id/claim',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match: strong etag',
        ],
        statuses:
        [
            '204',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash:
            'delete/organizations/organization-id/record-types/record-type-i'
            + 'd',
        verb: 'DELETE',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash:
            'delete/organizations/organization-id/record-types/record-type-i'
            + 'd/attributes/attribute-id',
        verb: 'DELETE',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/attributes/:attribute-id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash:
            'delete/organizations/organization-id/record-types/record-type-i'
            + 'd/instances/instance-id',
        verb: 'DELETE',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/instances/:instance-id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match (optional)',
        ],
        statuses:
        [
            '204',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'get/ai-agents',
        verb: 'GET',
        uri: '/api/ai-agents/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/ai-agents/id',
        verb: 'GET',
        uri: '/api/ai-agents/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/ai-agents/id/versions',
        verb: 'GET',
        uri: '/api/ai-agents/:id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/ai-agents/id/versions/etag',
        verb: 'GET',
        uri: '/api/ai-agents/:id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities',
        verb: 'GET',
        uri: '/api/identities/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id',
        verb: 'GET',
        uri: '/api/identities/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/credentials',
        verb: 'GET',
        uri: '/api/identities/:id/credentials/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/credentials/cid',
        verb: 'GET',
        uri: '/api/identities/:id/credentials/:cid',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/default-organization',
        verb: 'GET',
        uri: '/api/identities/:id/default-organization',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/invitations',
        verb: 'GET',
        uri: '/api/identities/:id/invitations/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/invitations/membership-id',
        verb: 'GET',
        uri: '/api/identities/:id/invitations/:membership-id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/invitations/membership-id/versions',
        verb: 'GET',
        uri: '/api/identities/:id/invitations/:membership-id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/invitations/membership-id/versions/etag',
        verb: 'GET',
        uri: '/api/identities/:id/invitations/:membership-id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/organizations',
        verb: 'GET',
        uri: '/api/identities/:id/organizations/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/pii',
        verb: 'GET',
        uri: '/api/identities/:id/pii',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/identities/id/providers',
        verb: 'GET',
        uri: '/api/identities/:id/providers/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/providers/eid',
        verb: 'GET',
        uri: '/api/identities/:id/providers/:eid',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/registration',
        verb: 'GET',
        uri: '/api/identities/:id/registration',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/identities/id/token-revocations/rid',
        verb: 'GET',
        uri: '/api/identities/:id/token-revocations/:rid',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/tokens',
        verb: 'GET',
        uri: '/api/identities/:id/tokens/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/tokens/jti',
        verb: 'GET',
        uri: '/api/identities/:id/tokens/:jti',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'get/identities/id/versions',
        verb: 'GET',
        uri: '/api/identities/:id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/identities/id/versions/etag',
        verb: 'GET',
        uri: '/api/identities/:id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id',
        verb: 'GET',
        uri: '/api/organizations/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/flows',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/flows/id',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/flows/id/records',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/:id/records/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/flows/id/records/frid',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/:id/records/:frid',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/flows/id/tags/name',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/:id/tags/:name',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/flows/id/versions',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/:id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/flows/id/versions/etag',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/:id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/flows/id/work-orders',
        verb: 'GET',
        uri: '/api/organizations/:id/flows/:id/work-orders/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/ideas',
        verb: 'GET',
        uri: '/api/organizations/:id/ideas/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/ideas/id',
        verb: 'GET',
        uri: '/api/organizations/:id/ideas/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/ideas/id/submissions',
        verb: 'GET',
        uri: '/api/organizations/:id/ideas/:id/submissions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/ideas/id/versions',
        verb: 'GET',
        uri: '/api/organizations/:id/ideas/:id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/ideas/id/versions/etag',
        verb: 'GET',
        uri: '/api/organizations/:id/ideas/:id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/invitations',
        verb: 'GET',
        uri: '/api/organizations/:id/invitations/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/invitations/membership-id',
        verb: 'GET',
        uri: '/api/organizations/:id/invitations/:membership-id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/invitations/membership-id/versions',
        verb: 'GET',
        uri: '/api/organizations/:id/invitations/:membership-id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/invitations/membership-id/versions/etag',
        verb: 'GET',
        uri:
            '/api/organizations/:id/invitations/:membership-id/versions/:eta'
            + 'g',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/objectives',
        verb: 'GET',
        uri: '/api/organizations/:id/objectives/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/objectives/id',
        verb: 'GET',
        uri: '/api/organizations/:id/objectives/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/objectives/id/revisions',
        verb: 'GET',
        uri: '/api/organizations/:id/objectives/:id/revisions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/objectives/id/versions',
        verb: 'GET',
        uri: '/api/organizations/:id/objectives/:id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/objectives/id/versions/etag',
        verb: 'GET',
        uri: '/api/organizations/:id/objectives/:id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/projects',
        verb: 'GET',
        uri: '/api/organizations/:id/projects/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/projects/id',
        verb: 'GET',
        uri: '/api/organizations/:id/projects/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/projects/id/flows',
        verb: 'GET',
        uri: '/api/organizations/:id/projects/:id/flows/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/projects/id/objective-actual-scores',
        verb: 'GET',
        uri: '/api/organizations/:id/projects/:id/objective-actual-scores/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/projects/id/objective-baseline-scores',
        verb: 'GET',
        uri: '/api/organizations/:id/projects/:id/objective-baseline-scores/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/projects/id/versions',
        verb: 'GET',
        uri: '/api/organizations/:id/projects/:id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/projects/id/versions/etag',
        verb: 'GET',
        uri: '/api/organizations/:id/projects/:id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash: 'get/organizations/id/versions',
        verb: 'GET',
        uri: '/api/organizations/:id/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/versions/etag',
        verb: 'GET',
        uri: '/api/organizations/:id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/work-orders',
        verb: 'GET',
        uri: '/api/organizations/:id/work-orders/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/work-orders/id',
        verb: 'GET',
        uri: '/api/organizations/:id/work-orders/:id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/id/work-orders/id/history',
        verb: 'GET',
        uri: '/api/organizations/:id/work-orders/:id/history',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/organization-id/record-types',
        verb: 'GET',
        uri: '/api/organizations/:organization-id/record-types/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'get/organizations/organization-id/record-types/record-type-id',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/a'
            + 'ttributes',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/attributes/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/a'
            + 'ttributes/attribute-id',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/attributes/:attribute-id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/i'
            + 'nstances',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/instances/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '204',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/i'
            + 'nstances/instance-id',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/instances/:instance-id',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/i'
            + 'nstances/instance-id/versions',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/instances/:instance-id/versions',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/i'
            + 'nstances/instance-id/versions/etag',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/instances/:instance-id/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/v'
            + 'ersions',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/versions/',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash:
            'get/organizations/organization-id/record-types/record-type-id/v'
            + 'ersions/etag',
        verb: 'GET',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/versions/:etag',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '403',
            '404',
            '410',
        ],
    },
    {
        hash:
            'patch/organizations/organization-id/record-types/record-type-id'
            + '/instances/instance-id',
        verb: 'PATCH',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/instances/:instance-id',
        body:
            '{\n  "set": [\n    {\n      "attribute_id": "id",\n      "value'
            + '": "value"\n    }\n  ],\n  "clear": []\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: *',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'post/authentication/authorize',
        verb: 'POST',
        uri: '/api/authentication/authorize',
        body:
            '{\n  "method": "password",\n  "client_id": "id",\n  "code_chall'
            + 'enge": "code_challenge",\n  "code_challenge_method": "S256"\n'
            + '}',
        headers:
        [
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
        ],
    },
    {
        hash: 'post/authentication/token',
        verb: 'POST',
        uri: '/api/authentication/token',
        body:
            '{\n  "grant_type": "authorization_code",\n  "client_id": "id"\n'
            + '}',
        headers:
        [
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
        ],
    },
    {
        hash: 'post/identities',
        verb: 'POST',
        uri: '/api/identities/',
        body: '{\n  "id": "id",\n  "kind": "person"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
        ],
    },
    {
        hash: 'post/identities/id/tokens/jti/revocation',
        verb: 'POST',
        uri: '/api/identities/:id/tokens/:jti/revocation',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'post/identities/id/tokens/jti/rotation',
        verb: 'POST',
        uri: '/api/identities/:id/tokens/:jti/rotation',
        body: 'none',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '401',
            '404',
        ],
    },
    {
        hash: 'post/organizations/id/flows',
        verb: 'POST',
        uri: '/api/organizations/:id/flows/',
        body:
            '{\n  "id": "id",\n  "flow": {},\n  "projectFlowId": "id",\n  "p'
            + 'rojectFlow": {},\n  "initialState": "active",\n  "initialStat'
            + 'eEventId": "id",\n  "initialStateAt": "2020-01-01T00:00:00.00'
            + '0Z",\n  "graphDelta": {\n    "nodes": [],\n    "edges": [],\n'
            + '    "deletions": [],\n    "memberEvents": [],\n    "attribute'
            + 'Events": []\n  }\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'post/organizations/id/flows/id/undo',
        verb: 'POST',
        uri: '/api/organizations/:id/flows/:id/undo',
        body: '{\n  "eventId": "id",\n  "at": "2020-01-01T00:00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match: strong etag',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'post/organizations/id/ideas/id/conversion',
        verb: 'POST',
        uri: '/api/organizations/:id/ideas/:id/conversion',
        body:
            '{\n  "projectId": "id",\n  "project": {},\n  "idea": {},\n  "id'
            + 'eaStateEventId": "id",\n  "ideaState": "promoted",\n  "ideaSt'
            + 'ateAt": "2020-01-01T00:00:00.000Z",\n  "projectStateEventId":'
            + ' "id",\n  "projectState": "active",\n  "projectStateAt": "202'
            + '0-01-01T00:00:00.000Z",\n  "baselines": []\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match: strong etag',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'post/organizations/id/invitations',
        verb: 'POST',
        uri: '/api/organizations/:id/invitations/',
        body:
            '{\n  "email": "email",\n  "grantAt": "2020-01-01T00:00:00.000Z"'
            + '\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'post/organizations/id/objectives',
        verb: 'POST',
        uri: '/api/organizations/:id/objectives/',
        body:
            '{\n  "id": "id",\n  "objective": {},\n  "revisionId": "id",\n  '
            + '"revision": {},\n  "initialState": "active"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'post/organizations/id/work-orders',
        verb: 'POST',
        uri: '/api/organizations/:id/work-orders/',
        body:
            '{\n  "id": "id",\n  "workOrder": {},\n  "flowWorkOrderId": "id"'
            + ',\n  "flowWorkOrder": {},\n  "stateEventIds": [\n    "id",\n '
            + '   "id",\n    "id"\n  ],\n  "stateEventAts": [\n    "2020-01-'
            + '01T00:00:00.000Z",\n    "2020-01-01T00:00:00.000Z",\n    "202'
            + '0-01-01T00:00:00.000Z"\n  ],\n  "states": [\n    "start",\n  '
            + '  "active",\n    "claimed"\n  ]\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
        ],
    },
    {
        hash: 'post/organizations/id/work-orders/id/transition',
        verb: 'POST',
        uri: '/api/organizations/:id/work-orders/:id/transition',
        body:
            '{\n  "transitionEventId": "id",\n  "targetState": "targetState"'
            + ',\n  "release": null,\n  "transitionAt": "2020-01-01T00:00:00'
            + '.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match: strong etag',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'post/organizations/organization-id/record-types',
        verb: 'POST',
        uri: '/api/organizations/:organization-id/record-types/',
        body:
            '{\n  "kind": "create",\n  "id": "id",\n  "record": {\n    "orga'
            + 'nization_id": "id",\n    "name": "name",\n    "description": '
            + '"description",\n    "position": 0\n  },\n  "attributes": [],'
            + '\n  "initialState": "active"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/ai-agents/id',
        verb: 'PUT',
        uri: '/api/ai-agents/:id',
        body:
            '{\n  "name": "name",\n  "description": "description",\n  "model'
            + '": "nqNVXnBkUBLoKlenbyPIZQ",\n  "skill_focus": "skill_focus"'
            + '\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id',
        verb: 'PUT',
        uri: '/api/identities/:id',
        body:
            '{\n  "kind": "person",\n  "title": "Engineer",\n  "department":'
            + ' "Product",\n  "strengths": [\n    "Leadership"\n  ],\n  "tea'
            + 'm_dimensions": {\n    "driver": 60\n  }\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id/credentials/cid',
        verb: 'PUT',
        uri: '/api/identities/:id/credentials/:cid',
        body:
            '{\n  "identity_id": "id",\n  "kind": "password",\n  "status": "'
            + 'set",\n  "secret": "secret",\n  "at": "2020-01-01T00:00:00.00'
            + '0Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id/default-organization',
        verb: 'PUT',
        uri: '/api/identities/:id/default-organization',
        body: '{\n  "organization_id": "id"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id/invitations/membership-id',
        verb: 'PUT',
        uri: '/api/identities/:id/invitations/:membership-id',
        body:
            '{\n  "state": "accepted",\n  "at": "2020-01-01T00:00:00.000Z"\n'
            + '}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match: strong etag',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'put/identities/id/pii',
        verb: 'PUT',
        uri: '/api/identities/:id/pii',
        body:
            '{\n  "name": "name",\n  "email": "email",\n  "phone": "phone",'
            + '\n  "bio": "bio"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id/providers/eid',
        verb: 'PUT',
        uri: '/api/identities/:id/providers/:eid',
        body:
            '{\n  "identity_id": "id",\n  "provider": "provider",\n  "provid'
            + 'er_subject": "provider_subject",\n  "action": "linked",\n  "a'
            + 't": "2020-01-01T00:00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id/registration',
        verb: 'PUT',
        uri: '/api/identities/:id/registration',
        body:
            '{\n  "grant_types": "grant_types",\n  "redirect_uris": "redirec'
            + 't_uris",\n  "jwks": "jwks",\n  "aud": "aud",\n  "status": "ac'
            + 'tive"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id/token-revocations/rid',
        verb: 'PUT',
        uri: '/api/identities/:id/token-revocations/:rid',
        body:
            '{\n  "identity_id": "id",\n  "at": "2020-01-01T00:00:00.000Z"\n'
            + '}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/identities/id/tokens/jti',
        verb: 'PUT',
        uri: '/api/identities/:id/tokens/:jti',
        body:
            '{\n  "jti": "jti",\n  "identity_id": "id",\n  "action": "issued'
            + '",\n  "chain_id": "id",\n  "at": "2020-01-01T00:00:00.000Z"\n'
            + '}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id',
        verb: 'PUT',
        uri: '/api/organizations/:id',
        body:
            '{\n  "name": "name",\n  "domain": "domain",\n  "next_billing": '
            + '"2020-01-01T00:00:00.000Z",\n  "seats": 0,\n  "projects_limit'
            + '": 0,\n  "ideas_limit": 0\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/flows/id',
        verb: 'PUT',
        uri: '/api/organizations/:id/flows/:id',
        body:
            '{\n  "name": "name",\n  "is_locked": false,\n  "is_auto_layout"'
            + ': false,\n  "is_auto_fit": false,\n  "lock_timeout": 0,\n  "s'
            + 'tate": "active",\n  "state_at": "2020-01-01T00:00:00.000Z",\n'
            + '  "state_event_id": "id",\n  "graph": {\n    "nodes": [],\n  '
            + '  "edges": []\n  },\n  "graphDelta": {\n    "nodes": [],\n   '
            + ' "edges": [],\n    "deletions": [],\n    "memberEvents": [],'
            + '\n    "attributeEvents": []\n  },\n  "revivals": []\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: *',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'put/organizations/id/flows/id/records/frid',
        verb: 'PUT',
        uri: '/api/organizations/:id/flows/:id/records/:frid',
        body:
            '{\n  "flow_id": "id",\n  "record_id": "id",\n  "at": "2020-01-0'
            + '1T00:00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/flows/id/tags/name',
        verb: 'PUT',
        uri: '/api/organizations/:id/flows/:id/tags/:name',
        body: '{\n  "flow_response_id": "id"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/flows/id/work-orders/woid',
        verb: 'PUT',
        uri: '/api/organizations/:id/flows/:id/work-orders/:woid',
        body:
            '{\n  "flow_id": "id",\n  "work_order_id": "id",\n  "at": "2020-'
            + '01-01T00:00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/ideas/id',
        verb: 'PUT',
        uri: '/api/organizations/:id/ideas/:id',
        body:
            '{\n  "title": "title",\n  "position": 0,\n  "problem_statement"'
            + ': "problem_statement",\n  "target_users": "target_users",\n  '
            + '"proposed_solution": "proposed_solution",\n  "expected_outcom'
            + 'e": "expected_outcome",\n  "success_metrics": "success_metric'
            + 's",\n  "state": "submitted"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/ideas/id/submissions/sid',
        verb: 'PUT',
        uri: '/api/organizations/:id/ideas/:id/submissions/:sid',
        body:
            '{\n  "idea_id": "id",\n  "member_id": "id",\n  "at": "2020-01-0'
            + '1T00:00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/invitations/membership-id',
        verb: 'PUT',
        uri: '/api/organizations/:id/invitations/:membership-id',
        body:
            '{\n  "state": "revoked",\n  "at": "2020-01-01T00:00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: *',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'put/organizations/id/objectives/id',
        verb: 'PUT',
        uri: '/api/organizations/:id/objectives/:id',
        body: '{\n  "position": 0,\n  "state": "active"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/objectives/id/revisions/rid',
        verb: 'PUT',
        uri: '/api/organizations/:id/objectives/:id/revisions/:rid',
        body:
            '{\n  "objective_id": "id",\n  "name": "name",\n  "description":'
            + ' "description",\n  "member_id": "id",\n  "at": "2020-01-01T00'
            + ':00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/projects/id',
        verb: 'PUT',
        uri: '/api/organizations/:id/projects/:id',
        body:
            '{\n  "title": "title",\n  "description": "description",\n  "pro'
            + 'gress": 0,\n  "start_date": "2020-01-01",\n  "target_end_date'
            + '": "2020-01-01",\n  "estimated_cost": 0,\n  "actual_cost": 0,'
            + '\n  "position": 0,\n  "state": "active"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/projects/id/flows/pfid',
        verb: 'PUT',
        uri: '/api/organizations/:id/projects/:id/flows/:pfid',
        body:
            '{\n  "project_id": "id",\n  "flow_id": "id",\n  "at": "2020-01-'
            + '01T00:00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/projects/id/objective-actual-scores/sid',
        verb: 'PUT',
        uri:
            '/api/organizations/:id/projects/:id/objective-actual-scores/:si'
            + 'd',
        body:
            '{\n  "project_id": "id",\n  "objective_id": "id",\n  "score": 0'
            + ',\n  "member_id": "id",\n  "at": "2020-01-01T00:00:00.000Z"\n'
            + '}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash:
            'put/organizations/id/projects/id/objective-baseline-scores/sid',
        verb: 'PUT',
        uri:
            '/api/organizations/:id/projects/:id/objective-baseline-scores/:'
            + 'sid',
        body:
            '{\n  "project_id": "id",\n  "objective_id": "id",\n  "score": 0'
            + ',\n  "member_id": "id",\n  "at": "2020-01-01T00:00:00.000Z"\n'
            + '}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash: 'put/organizations/id/work-orders/id',
        verb: 'PUT',
        uri: '/api/organizations/:id/work-orders/:id',
        body:
            '{\n  "display_id": "display_id",\n  "flow_graph": {\n    "name"'
            + ': "name",\n    "lockTimeout": 0,\n    "nodes": [],\n    "edge'
            + 's": []\n  },\n  "position": 0\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: *',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'put/organizations/id/work-orders/id/binding',
        verb: 'PUT',
        uri: '/api/organizations/:id/work-orders/:id/binding',
        body: '{\n  "instance_id": "id",\n  "record_type_id": "id"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match: strong etag',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'put/organizations/id/work-orders/id/claim',
        verb: 'PUT',
        uri: '/api/organizations/:id/work-orders/:id/claim',
        body:
            '{\n  "claimEventId": "id",\n  "claimAt": "2020-01-01T00:00:00.0'
            + '00Z",\n  "expireEventId": "id",\n  "expireAt": "2020-01-01T00'
            + ':00:00.000Z"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match: strong etag',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
            '428',
        ],
    },
    {
        hash: 'put/organizations/organization-id/record-types/record-type-id',
        verb: 'PUT',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd',
        body:
            '{\n  "name": "name",\n  "description": "description",\n  "posit'
            + 'ion": 0,\n  "state": "active"\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
    {
        hash:
            'put/organizations/organization-id/record-types/record-type-id/a'
            + 'ttributes/attribute-id',
        verb: 'PUT',
        uri:
            '/api/organizations/:organization-id/record-types/:record-type-i'
            + 'd/attributes/:attribute-id',
        body:
            '{\n  "name": "name",\n  "attribute_type": "text",\n  "sort_orde'
            + 'r": 0,\n  "options": [],\n  "constraints": [],\n  "read_roles'
            + '": [],\n  "write_roles": []\n}',
        headers:
        [
            'Authorization: Bearer …',
            'Operation-ID: on every request',
            'If-Match or If-None-Match: * (optional)',
        ],
        statuses:
        [
            '200',
            '400',
            '401',
            '403',
            '404',
            '412',
        ],
    },
];

export const API_DOC_STATUSES:
    readonly ApiDocStatus[] = [
    {
        hash: 'statuses/200',
        code: '200',
        body: 'empty',
    },
    {
        hash: 'statuses/201',
        code: '201',
        body: 'empty',
    },
    {
        hash: 'statuses/204',
        code: '204',
        body: 'empty',
    },
    {
        hash: 'statuses/400',
        code: '400',
        body: '{\n  "error": "validation message"\n}',
    },
    {
        hash: 'statuses/401',
        code: '401',
        body: '{\n  "error": "invalid_token"\n}',
    },
    {
        hash: 'statuses/403',
        code: '403',
        body:
            '{\n  "error":\n  "forbidden: path organization does not match t'
            + 'he token organization"\n}',
    },
    {
        hash: 'statuses/404',
        code: '404',
        body: '{\n  "error": "Not found: /path"\n}',
    },
    {
        hash: 'statuses/405',
        code: '405',
        body: '{\n  "error": "Method GET not allowed on /path"\n}',
    },
    {
        hash: 'statuses/409',
        code: '409',
        body: '{\n  "error": "conflict message"\n}',
    },
    {
        hash: 'statuses/410',
        code: '410',
        body: '{\n  "error": "Gone: table/id"\n}',
    },
    {
        hash: 'statuses/412',
        code: '412',
        body: '{\n  "error": "precondition failed"\n}',
    },
    {
        hash: 'statuses/422',
        code: '422',
        body: '{\n  "error": "unprocessable message"\n}',
    },
    {
        hash: 'statuses/428',
        code: '428',
        body: '{\n  "error": "If-Match required"\n}',
    },
    {
        hash: 'statuses/429',
        code: '429',
        body: '{\n  "error": "too many requests"\n}',
    },
];
