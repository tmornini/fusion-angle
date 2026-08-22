// Derive API.svg and verb/status rooms from the live
// route table. The table is the surface: if it is not
// on routes[], it does not exist. Run via
// ./generate-api-documentation [--check].
//
// Dev tooling, like generate-schema-svg.ts: run with
// `node --strip-types`, excluded from tsc (Node APIs,
// no @types/node), kept under the 78-char lint.
// Output is deterministic — no clocks, no randomness,
// stable ordering — so `--check` can gate staleness.
import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { routes } from '../../api/routes.ts';
import type { Route } from '../../api/routes.ts';
import {
    HTTP_VERBS,
    offeredVerbs,
    routePatternOf,
    uriOf,
} from '../../api/route-surface.ts';
import type { HttpVerb } from
    '../../api/route-surface.ts';
import { pathSegmentsOf } from
    '../../api/path-segments.ts';
import {
    STATUS_DOCUMENTS,
} from '../../api/http-status-documents.ts';
import type { StatusDocument } from
    '../../api/http-status-documents.ts';
import { AUTHENTICATION_ROUTES } from
    '../../api/request-auth.ts';
import { familyRegistration } from
    '../../api/family-registry.ts';

const OUT_ROOT = 'web-app/api-documentation';
const LINE_MAX = 78;
const AT = '2020-01-01T00:00:00.000Z';
const KEPT_ROOT_NAMES = new Set([
    'index.html',
    'index.ts',
]);

function wrapLine(line: string): string[] {
    if (line.length <= LINE_MAX) return [line];
    const lines: string[] = [];
    let rest = line;
    while (rest.length > LINE_MAX) {
        let cut = rest.lastIndexOf(' ', LINE_MAX);
        if (cut < 1) cut = LINE_MAX;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^ /u, '');
    }
    if (rest !== '') lines.push(rest);
    return lines;
}

function wrapText(text: string): string {
    return text.split('\n').flatMap(wrapLine)
        .join('\n');
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeXml(s: string): string {
    return escapeHtml(s).replace(/"/g, '&quot;');
}

function formatJson(value: unknown): string {
    const raw = JSON.stringify(value, null, 2);
    return raw.split('\n').flatMap((line) => {
        if (line.length <= LINE_MAX) return [line];
        const m = /^(\s*"[^"]+":\s*)(.*)$/.exec(line);
        if (m && m[1]!.length < LINE_MAX) {
            return [
                m[1]!.trimEnd(),
                '  ' + m[2]!,
            ].flatMap(wrapLine);
        }
        return wrapLine(line);
    }).join('\n');
}

function heading(tag: string, text: string): string {
    const open = '<' + tag + '>';
    const close = '</' + tag + '>';
    const one = open + text + close;
    if (one.length <= LINE_MAX) return one;
    return open + '\n' + wrapText(text) + '\n'
        + close;
}

function wireUriOf(resourceUri: string): string {
    return '/api' + resourceUri;
}

export function roomPathOf(
    verb: string,
    segments: readonly string[],
): string {
    const parts = [verb.toLowerCase()];
    for (const seg of segments) {
        if (seg === '') continue;
        parts.push(
            seg.startsWith(':') ? seg.slice(1) : seg,
        );
    }
    return parts.join('/') + '/index.html';
}

function writeExample(
    verb: string,
    uri: string,
    body: unknown,
): [string, unknown] {
    return [verb + ' ' + uri, body];
}

function graphDeltaExample(): Record<string, unknown> {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

function ideaDocument(): Record<string, unknown> {
    return {
        title: 'title',
        position: 0,
        problem_statement: 'problem_statement',
        target_users: 'target_users',
        proposed_solution: 'proposed_solution',
        expected_outcome: 'expected_outcome',
        success_metrics: 'success_metrics',
        state: 'submitted',
    };
}

function projectDocument(): Record<string, unknown> {
    return {
        title: 'title',
        description: 'description',
        progress: 0,
        start_date: '2020-01-01',
        target_end_date: '2020-01-01',
        estimated_cost: 0,
        actual_cost: 0,
        position: 0,
        state: 'active',
    };
}

function flowDocument(): Record<string, unknown> {
    return {
        name: 'name',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: 0,
        state: 'active',
        state_at: AT,
        state_event_id: 'id',
        graph: { nodes: [], edges: [] },
        graphDelta: graphDeltaExample(),
        revivals: [],
    };
}

function workOrderDocument(): Record<string, unknown> {
    return {
        display_id: 'display_id',
        flow_graph: {
            name: 'name',
            lockTimeout: 0,
            nodes: [],
            edges: [],
        },
        position: 0,
    };
}

function recordDocument(): Record<string, unknown> {
    return {
        name: 'name',
        description: 'description',
        position: 0,
        state: 'active',
    };
}

function attributeDocument(): Record<string, unknown> {
    return {
        name: 'name',
        attribute_type: 'text',
        sort_order: 0,
        options: [],
        constraints: [],
        read_roles: [],
        write_roles: [],
    };
}

function invitationTransition(
    state: string,
): Record<string, unknown> {
    return {
        state,
        membershipId: 'id',
        eventId: 'id',
        at: AT,
    };
}

const WRITE_EXAMPLES = new Map<string, unknown>([
    writeExample('post', '/identities/', {
        id: 'id',
        kind: 'person',
    }),
    writeExample('put', '/identities/:id', {
        kind: 'person',
    }),
    writeExample(
        'put',
        '/identities/:id/default-organization',
        { organization_id: 'id' },
    ),
    writeExample(
        'put',
        '/identities/:id/invitations/:id',
        invitationTransition('accepted'),
    ),
    writeExample('put', '/ai-agents/:id', {
        name: 'name',
        description: 'description',
        model: 'nqNVXnBkUBLoKlenbyPIZQ',
        skill_focus: 'skill_focus',
    }),
    writeExample('put', '/identities/:id/pii', {
        name: 'name',
        email: 'email',
        phone: 'phone',
        bio: 'bio',
    }),
    writeExample(
        'put',
        '/identities/:id/credentials/:cid',
        {
            identity_id: 'id',
            kind: 'password',
            status: 'set',
            secret: 'secret',
            at: AT,
        },
    ),
    writeExample(
        'put',
        '/identities/:id/registration',
        {
            grant_types: 'grant_types',
            redirect_uris: 'redirect_uris',
            jwks: 'jwks',
            aud: 'aud',
            status: 'active',
        },
    ),
    writeExample(
        'put',
        '/identities/:id/token-revocations/:rid',
        { identity_id: 'id', at: AT },
    ),
    writeExample(
        'put',
        '/identities/:id/tokens/:tid',
        {
            jti: 'jti',
            identity_id: 'id',
            action: 'issued',
            chain_id: 'id',
            at: AT,
        },
    ),
    writeExample(
        'put',
        '/identities/:id/providers/:eid',
        {
            identity_id: 'id',
            provider: 'provider',
            provider_subject: 'provider_subject',
            action: 'linked',
            at: AT,
        },
    ),
    writeExample('post', '/authentication/token', {
        grant_type: 'authorization_code',
        code: 'code',
        code_verifier: 'code_verifier',
    }),
    writeExample(
        'post',
        '/authentication/authorize',
        {
            method: 'password',
            username: 'username',
            password: 'password',
            code_challenge: 'code_challenge',
            code_challenge_method: 'S256',
        },
    ),
    writeExample(
        'post',
        '/organizations/:id/ideas/:id/conversion',
        {
            projectId: 'id',
            project: {},
            idea: {},
            ideaStateEventId: 'id',
            ideaState: 'promoted',
            ideaStateAt: AT,
            projectStateEventId: 'id',
            projectState: 'active',
            projectStateAt: AT,
            baselines: [],
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/ideas/:id/submissions/:sid',
        { idea_id: 'id', member_id: 'id', at: AT },
    ),
    writeExample('post', '/organizations/:id/flows/', {
        id: 'id',
        flow: {},
        projectFlowId: 'id',
        projectFlow: {},
        initialState: 'active',
        initialStateEventId: 'id',
        initialStateAt: AT,
        graphDelta: graphDeltaExample(),
    }),
    writeExample(
        'put',
        '/organizations/:id/flows/:id',
        flowDocument(),
    ),
    writeExample(
        'post',
        '/organizations/:id/flows/:id/undo',
        { eventId: 'id', at: AT },
    ),
    writeExample(
        'put',
        '/organizations/:id/projects/:id/flows/:pfid',
        {
            project_id: 'id',
            flow_id: 'id',
            at: AT,
        },
    ),
    writeExample(
        'post',
        '/organizations/:id/work-orders/',
        {
            id: 'id',
            workOrder: {},
            flowWorkOrderId: 'id',
            flowWorkOrder: {},
            stateEventIds: ['id', 'id', 'id'],
            stateEventAts: [AT, AT, AT],
            states: ['start', 'active', 'claimed'],
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/work-orders/:id',
        workOrderDocument(),
    ),
    writeExample(
        'put',
        '/organizations/:id/work-orders/:id/claim',
        {
            claimEventId: 'id',
            claimAt: AT,
            expireEventId: 'id',
            expireAt: AT,
        },
    ),
    writeExample(
        'post',
        '/organizations/:id/work-orders/:id'
            + '/transition',
        {
            transitionEventId: 'id',
            targetState: 'targetState',
            release: null,
            transitionAt: AT,
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/work-orders/:id/binding',
        { instance_id: 'id', record_type_id: 'id' },
    ),
    writeExample(
        'put',
        '/organizations/:id/flows/:id/work-orders/'
            + ':woid',
        {
            flow_id: 'id',
            work_order_id: 'id',
            at: AT,
        },
    ),
    writeExample(
        'post',
        '/organizations/:organization-id/'
            + 'record-types/',
        {
            kind: 'create',
            id: 'id',
            record: {
                organization_id: 'id',
                name: 'name',
                description: 'description',
                position: 0,
            },
            attributes: [],
            initialState: 'active',
            initialStateEventId: 'id',
            initialStateAt: AT,
        },
    ),
    writeExample(
        'put',
        '/organizations/:organization-id/'
            + 'record-types/:record-type-id',
        recordDocument(),
    ),
    writeExample(
        'put',
        '/organizations/:organization-id/'
            + 'record-types/:record-type-id/'
            + 'attributes/:attribute-id',
        attributeDocument(),
    ),
    writeExample(
        'patch',
        '/organizations/:organization-id/'
            + 'record-types/:record-type-id/'
            + 'instances/:instance-id',
        {
            set: [{
                attribute_id: 'id',
                value: 'value',
            }],
            clear: [],
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/flows/:id/records/:frid',
        { flow_id: 'id', record_id: 'id', at: AT },
    ),
    writeExample(
        'put',
        '/organizations/:id/flows/:id/tags/:name',
        { flow_response_id: 'id' },
    ),
    writeExample('put', '/organizations/:id', {
        name: 'name',
        domain: 'domain',
        next_billing: AT,
        seats: 0,
        projects_limit: 0,
        ideas_limit: 0,
    }),
    writeExample(
        'post',
        '/organizations/:id/invitations/',
        {
            email: 'email',
            invitationId: 'id',
            grantEventId: 'id',
            grantAt: AT,
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/invitations/:id',
        invitationTransition('revoked'),
    ),
    writeExample(
        'put',
        '/organizations/:organization-id/members/'
            + ':identity-id',
        { type: 'member', at: AT },
    ),
    writeExample(
        'put',
        '/organizations/:id/ideas/:id',
        ideaDocument(),
    ),
    writeExample(
        'put',
        '/organizations/:id/projects/:id',
        projectDocument(),
    ),
    writeExample(
        'post',
        '/organizations/:id/objectives/',
        {
            id: 'id',
            objective: {},
            revisionId: 'id',
            revision: {},
            initialState: 'active',
            initialStateEventId: 'id',
            initialStateAt: AT,
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/objectives/:id',
        { position: 0, state: 'active' },
    ),
    writeExample(
        'put',
        '/organizations/:id/objectives/:id/'
            + 'revisions/:rid',
        {
            objective_id: 'id',
            name: 'name',
            description: 'description',
            member_id: 'id',
            at: AT,
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/projects/:id/'
            + 'objective-baseline-scores/:sid',
        {
            project_id: 'id',
            objective_id: 'id',
            score: 0,
            member_id: 'id',
            at: AT,
        },
    ),
    writeExample(
        'put',
        '/organizations/:id/projects/:id/'
            + 'objective-actual-scores/:sid',
        {
            project_id: 'id',
            objective_id: 'id',
            score: 0,
            member_id: 'id',
            at: AT,
        },
    ),
]);

export function exampleBodyFor(
    pattern: string,
    verb: string,
): string {
    const lower = verb.toLowerCase();
    if (lower === 'get' || lower === 'delete') {
        return 'none';
    }
    const body = WRITE_EXAMPLES.get(
        lower + ' ' + pattern,
    );
    if (body === undefined) return 'none';
    return formatJson(body);
}

function isAuthGrant(row: Route): boolean {
    return AUTHENTICATION_ROUTES.has(
        routePatternOf(row),
    );
}

function isOrganizationNested(row: Route): boolean {
    return row.segments[0] === 'organizations';
}

function documentFamilyOf(
    row: Route,
): string | undefined {
    const segs = row.segments;
    if (
        segs[0] === 'organizations'
        && segs.length === 4
        && segs[1] !== undefined
        && segs[1].startsWith(':')
        && segs[2] !== undefined
        && !segs[2].startsWith(':')
        && segs[3] === ':id'
    ) {
        return segs[2];
    }
    if (
        segs.length === 2
        && segs[0] !== undefined
        && !segs[0].startsWith(':')
        && segs[1] === ':id'
    ) {
        return segs[0];
    }
    return undefined;
}

function isLockedDocumentPut(row: Route): boolean {
    const family = documentFamilyOf(row);
    if (family === undefined) return false;
    return familyRegistration(family)?.concurrency
        === 'locked';
}

function isLockedPutUri(uri: string): boolean {
    return uri === '/organizations/:id/flows/:id';
}

function statusCodesFor(
    row: Route,
    verb: HttpVerb,
): string[] {
    const codes: number[] = [];
    if (verb === 'delete') codes.push(204);
    else codes.push(200);
    const body = exampleBodyFor(uriOf(row), verb);
    if (body !== 'none') codes.push(400);
    codes.push(401);
    if (isOrganizationNested(row)) codes.push(403);
    if (!isAuthGrant(row)) codes.push(404);
    if (verb === 'put' && isLockedDocumentPut(row)) {
        codes.push(412, 428);
    }
    return codes.map(String);
}

function roomDepth(
    verb: string,
    uri: string,
): number {
    const path = roomPathOf(
        verb, pathSegmentsOf(uri),
    );
    return path.split('/').length - 1;
}

function statusHref(
    depth: number,
    code: string,
): string {
    return '../'.repeat(depth)
        + 'statuses/' + code + '/';
}

export function verbRoomHtml(
    verb: string,
    uri: string,
    statusCodes: readonly string[],
    body: string,
): string {
    const lower = verb.toLowerCase();
    const title = lower.toUpperCase()
        + ' ' + wireUriOf(uri);
    const depth = roomDepth(lower, uri);
    const write = lower === 'put'
        || lower === 'post'
        || lower === 'patch';
    const lines: string[] = [
        '<!doctype html>',
        '<meta charset="utf-8">',
        heading('title', title),
        heading('h1', title),
        '<h2>Request body</h2>',
    ];
    if (body === 'none' && write) {
        lines.push('<!-- no gate validator yet -->');
    }
    if (body === 'none') {
        lines.push('<pre>none</pre>');
    } else {
        lines.push(
            '<pre>',
            escapeHtml(body),
            '</pre>',
        );
    }
    lines.push('<h2>Headers</h2>', '<ul>');
    const grant = uri === '/authentication/token'
        || uri === '/authentication/authorize';
    if (!grant) {
        lines.push(
            '  <li>Authorization: Bearer …</li>',
        );
    }
    lines.push(
        '  <li>Operation-ID: on writes</li>',
    );
    if (lower === 'put' && isLockedPutUri(uri)) {
        lines.push(
            '  <li>If-Match: strong etag</li>',
        );
    }
    lines.push('</ul>', '<h2>Status</h2>', '<ul>');
    for (const code of statusCodes) {
        const href = statusHref(depth, code);
        lines.push(
            '  <li><a href="' + href + '">'
            + code + '</a></li>',
        );
    }
    lines.push('</ul>', '');
    return lines.join('\n');
}

function statusRoomHtml(
    doc: StatusDocument,
): string {
    const code = String(doc.code);
    const body = doc.body === null
        ? 'empty'
        : formatJson(doc.body);
    const lines: string[] = [
        '<!doctype html>',
        '<meta charset="utf-8">',
        heading('title', code),
        heading('h1', code),
    ];
    if (body === 'empty') {
        lines.push('<pre>empty</pre>');
    } else {
        lines.push(
            '<pre>',
            escapeHtml(body),
            '</pre>',
        );
    }
    lines.push('');
    return lines.join('\n');
}

function wingNameOf(row: Route): string {
    return row.segments[0] ?? '';
}

function compareUri(a: Route, b: Route): number {
    const left = uriOf(a);
    const right = uriOf(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

const VERB_W = 36;
const VERB_GAP = 4;
const PAD = 16;
const ROW_H = 18;
const WING_H = 24;
const LEGEND_H = 22;
const HEADER_H = 16;
const CIRCLE_R = 5;
const EMPTY = 10;
const URI_SIZE = 8.5;
const CHAR_W = 5.2;

function verbColumnX(index: number): number {
    return PAD + index * (VERB_W + VERB_GAP);
}

function uriX(): number {
    return verbColumnX(HTTP_VERBS.length) + 8;
}

export function svgOf(rows: readonly Route[]): string {
    const wings = new Map<string, Route[]>();
    for (const row of rows) {
        offeredVerbs(row);
        const name = wingNameOf(row);
        const list = wings.get(name);
        if (list) list.push(row);
        else wings.set(name, [row]);
    }
    const wingNames = [...wings.keys()].sort();
    for (const name of wingNames) {
        wings.get(name)!.sort(compareUri);
    }
    let longest = 0;
    for (const row of rows) {
        longest = Math.max(
            longest,
            wireUriOf(uriOf(row)).length,
        );
    }
    const width = Math.ceil(
        uriX() + longest * CHAR_W + PAD,
    );
    let y = PAD + 12;
    const parts: string[] = [];
    const legend =
        'filled circle = offered verb (item or'
        + ' operation)';
    parts.push(
        '  <text class="legend" x="' + PAD + '" y="'
        + y + '">' + escapeXml(legend) + '</text>',
    );
    y += LEGEND_H;
    HTTP_VERBS.forEach((verb, i) => {
        const cx = verbColumnX(i) + VERB_W / 2;
        parts.push(
            '  <text class="col" x="' + cx + '" y="'
            + y + '">'
            + escapeXml(verb.toUpperCase())
            + '</text>',
        );
    });
    y += HEADER_H;
    for (const name of wingNames) {
        y += 6;
        parts.push(
            '  <text class="wing" x="' + PAD + '" y="'
            + y + '">' + escapeXml(name) + '</text>',
        );
        y += WING_H - 8;
        for (const row of wings.get(name)!) {
            const verbs = new Set(offeredVerbs(row));
            const uri = wireUriOf(uriOf(row));
            const cy = y;
            HTTP_VERBS.forEach((verb, i) => {
                const cx = verbColumnX(i) + VERB_W / 2;
                if (verbs.has(verb)) {
                    const href = roomPathOf(
                        verb, row.segments,
                    );
                    parts.push(
                        '  <a href="'
                        + escapeXml(href) + '">',
                        '    <circle class="filled"'
                        + ' cx="' + cx + '" cy="'
                        + cy + '" r="' + CIRCLE_R
                        + '"/>',
                        '  </a>',
                    );
                } else {
                    const rx = cx - EMPTY / 2;
                    const ry = cy - EMPTY / 2;
                    parts.push(
                        '  <rect class="empty" x="'
                        + rx + '" y="' + ry
                        + '" width="' + EMPTY
                        + '" height="' + EMPTY
                        + '" fill="none"/>',
                    );
                }
            });
            parts.push(
                '  <text class="uri" x="' + uriX()
                + '" y="' + (cy + 3) + '">'
                + escapeXml(uri) + '</text>',
            );
            y += ROW_H;
        }
        y += 8;
    }
    const height = y + PAD;
    const style = [
        '    <style>',
        '      .legend, .wing, .col { font-family:',
        '        ui-sans-serif, system-ui, sans-serif;',
        '      }',
        '      .legend { fill: hsl(217 38% 38%);',
        '        font-size: 11px; }',
        '      .wing { fill: hsl(217 45% 15%);',
        '        font-size: 12px; font-weight: 700; }',
        '      .col { fill: hsl(217 12% 40%);',
        '        font-size: 8px; text-anchor: middle;',
        '      }',
        '      .uri { font-family: ui-monospace,',
        "        SFMono-Regular, Menlo, monospace;",
        '        font-size: ' + URI_SIZE + 'px;',
        '        fill: hsl(217 45% 15%); }',
        '      .filled { fill: hsl(217 45% 15%); }',
        '      .empty { fill: none;',
        '        stroke: hsl(217 30% 40%);',
        '        stroke-width: 1; }',
        '    </style>',
    ];
    return [
        '<svg xmlns="http://www.w3.org/2000/svg" '
        + 'viewBox="0 0 ' + width + ' ' + height
        + '" width="' + width + '" height="'
        + height + '">',
        '  <defs>',
        ...style,
        '  </defs>',
        '  <rect x="0" y="0" width="' + width
        + '" height="' + height
        + '" fill="hsl(217 30% 97%)"/>',
        ...parts,
        '</svg>',
        '',
    ].join('\n');
}

function generateAll(): Map<string, string> {
    const out = new Map<string, string>();
    out.set('API.svg', svgOf(routes));
    const rooms: { path: string; html: string }[] = [];
    for (const row of routes) {
        const uri = uriOf(row);
        for (const verb of offeredVerbs(row)) {
            rooms.push({
                path: roomPathOf(verb, row.segments),
                html: verbRoomHtml(
                    verb,
                    uri,
                    statusCodesFor(row, verb),
                    exampleBodyFor(uri, verb),
                ),
            });
        }
    }
    rooms.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    for (const room of rooms) {
        out.set(room.path, room.html);
    }
    for (const doc of STATUS_DOCUMENTS) {
        out.set(
            'statuses/' + doc.code + '/index.html',
            statusRoomHtml(doc),
        );
    }
    return out;
}

function readTree(root: string): Map<string, string> {
    const out = new Map<string, string>();
    if (!existsSync(root)) return out;
    const walk = (abs: string, rel: string): void => {
        const names = readdirSync(abs).sort();
        for (const name of names) {
            if (name.startsWith('.')) continue;
            if (
                rel === ''
                && KEPT_ROOT_NAMES.has(name)
            ) {
                continue;
            }
            const childRel = rel === ''
                ? name
                : rel + '/' + name;
            const childAbs = join(abs, name);
            if (statSync(childAbs).isDirectory()) {
                walk(childAbs, childRel);
            } else {
                out.set(
                    childRel,
                    readFileSync(childAbs, 'utf8'),
                );
            }
        }
    };
    walk(root, '');
    return out;
}

function mapsEqual(
    next: Map<string, string>,
    disk: Map<string, string>,
): boolean {
    if (next.size !== disk.size) return false;
    for (const [path, bytes] of next) {
        if (disk.get(path) !== bytes) return false;
    }
    return true;
}

function writeTree(
    root: string,
    files: Map<string, string>,
): void {
    mkdirSync(root, { recursive: true });
    const disk = readTree(root);
    for (const path of disk.keys()) {
        if (!files.has(path)) {
            rmSync(join(root, path));
        }
    }
    const paths = [...files.keys()].sort();
    for (const path of paths) {
        const abs = join(root, path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, files.get(path)!);
    }
}

function isCliEntry(): boolean {
    const entry = process.argv[1];
    return typeof entry === 'string'
        && /generate-api-documentation\.ts$/
            .test(entry);
}

function runCli(): void {
    if (process.argv.includes('--check')) {
        const next = generateAll();
        const disk = readTree(OUT_ROOT);
        if (!mapsEqual(next, disk)) {
            process.stderr.write(
                'api-documentation is stale — run'
                + ' ./generate-api-documentation\n',
            );
            process.exit(1);
        }
        process.stdout.write(
            'api-documentation is up to date\n',
        );
        return;
    }
    writeTree(OUT_ROOT, generateAll());
    process.stdout.write('wrote ' + OUT_ROOT + '\n');
}

if (isCliEntry()) runCli();
