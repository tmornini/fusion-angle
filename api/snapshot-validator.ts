import {
    TABLE_NAMES,
    SNAPSHOT_SCHEMA_VERSION,
    SNAPSHOT_SCHEMA_VERSION_KEY,
} from './db.ts';
import { extractErrorMessage } from '../shared/error-helpers.ts';
import {
    validateMemberEntity,
    validateHumanMemberEntity,
    validateAIMemberEntity,
    validateIdentityEntity,
    validateIdentityPiiEntity,
    validateIdentityCredentialEntity,
    validateIdentityTokenRevocationEntity,
    validateIdentityDefaultOrganizationEntity,
    validateRoleGrantEntity,
    validateIdentityTokenEntity,
    validateClientEntity,
    validateIdentityProviderEntity,
    validateAuthorizationCodeEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateFlowNodeEntity,
    validateFlowEdgeEntity,
    validateFlowNodeMemberEntity,
    validateFlowNodeAttributeEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateRecordEntity,
    validateRecordAttributeEntity,
    validateFlowRecordEntity,
    validateOrganizationEntity,
    validateMembershipEntity,
    validateInvitationEntity,
    validateIdeaSubmissionEntity,
    validateStateEntity,
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateRequestEntity,
    validateResponseEntity,
} from './validators.ts';

// Map table name → entity validator. Stored rows
// carry `id` as their storage key — strip it before
// passing to each validator, which enforces an exact
// body-key set.
function validateSnapshotRow(
    table: string,
    row: Record<string, unknown>,
    rowIndex: number,
): void {
    const label =
        'snapshot.' + table
        + '[' + rowIndex + ']';
    const { id: _id, ...body } = row;
    try {
        switch (table) {
            case 'members':
                validateMemberEntity(body);
                break;
            case 'human_members':
                validateHumanMemberEntity(body);
                break;
            case 'ai_members':
                validateAIMemberEntity(body);
                break;
            case 'identities':
                validateIdentityEntity(body);
                break;
            case 'identity_pii':
                validateIdentityPiiEntity(body);
                break;
            case 'identity_credentials':
                validateIdentityCredentialEntity(body);
                break;
            case 'identity_token_revocations':
                validateIdentityTokenRevocationEntity(body);
                break;
            case 'identity_default_organizations':
                validateIdentityDefaultOrganizationEntity(body);
                break;
            case 'role_grants':
                validateRoleGrantEntity(body);
                break;
            case 'identity_tokens':
                validateIdentityTokenEntity(body);
                break;
            case 'clients':
                validateClientEntity(body);
                break;
            case 'identity_providers':
                validateIdentityProviderEntity(body);
                break;
            case 'authorization_codes':
                validateAuthorizationCodeEntity(body);
                break;
            case 'ideas':
                validateIdeaEntity(body);
                break;
            case 'projects':
                validateProjectEntity(body);
                break;
            case 'flows':
                validateFlowEntity(body);
                break;
            case 'flow_versions':
                validateFlowVersionEntity(body);
                break;
            case 'flow_nodes':
                validateFlowNodeEntity(body);
                break;
            case 'flow_edges':
                validateFlowEdgeEntity(body);
                break;
            case 'flow_node_members':
                validateFlowNodeMemberEntity(body);
                break;
            case 'flow_node_attributes':
                validateFlowNodeAttributeEntity(body);
                break;
            case 'project_flows':
                validateProjectFlowEntity(body);
                break;
            case 'work_orders':
                validateWorkOrderEntity(body);
                break;
            case 'flow_work_orders':
                validateFlowWorkOrderEntity(body);
                break;
            case 'state_field_values':
                validateStateFieldValueEntity(
                    body,
                );
                break;
            case 'records':
                validateRecordEntity(body);
                break;
            case 'record_attributes':
                validateRecordAttributeEntity(
                    body,
                );
                break;
            case 'flow_records':
                validateFlowRecordEntity(body);
                break;
            case 'organizations':
                validateOrganizationEntity(body);
                break;
            case 'memberships':
                validateMembershipEntity(body);
                break;
            case 'invitations':
                validateInvitationEntity(body);
                break;
            case 'idea_submissions':
                validateIdeaSubmissionEntity(body);
                break;
            case 'states':
                validateStateEntity(body);
                break;
            case 'objectives':
                validateObjectiveEntity(body);
                break;
            case 'objective_revisions':
                validateObjectiveRevisionEntity(body);
                break;
            case 'project_objective_baseline_scores':
                validateBaselineScoreEntity(body);
                break;
            case 'project_objective_actual_scores':
                validateActualScoreEntity(body);
                break;
            case 'requests':
                validateRequestEntity(body);
                break;
            case 'responses':
                validateResponseEntity(body);
                break;
        }
    } catch (err) {
        const msg = extractErrorMessage(err);
        throw new Error(
            'Invalid snapshot row in '
            + label + ': ' + msg,
        );
    }
}

// The UNIVERSAL version gate's own typed rejection — thrown
// by parseAndValidateSnapshot, so every DbAdapter.putSnapshot
// caller crosses it (route dispatch, a direct adapter call, a
// test). `found` is the raw value read at
// SNAPSHOT_SCHEMA_VERSION_KEY, or undefined when the key was
// absent — never coerced, never defaulted (Abomination: Default
// Values). Mirrors SnapshotIncompatibleError's own shape (a
// named Error subclass with a diagnostic field) — the client-
// side twin web-app/app/adapters/snapshots.ts's
// scanForRetiredKeys pre-flight checks for BEFORE this ever
// runs, as a convenience only; this is the guarantee.
export class SnapshotVersionMismatchError extends Error {
    readonly found: unknown;
    constructor(found: unknown) {
        super(
            'Snapshot schema version '
            + (found === undefined
                ? 'is missing'
                : 'is ' + JSON.stringify(found))
            + '; required version is '
            + SNAPSHOT_SCHEMA_VERSION
            + '. Re-snapshot from current state.',
        );
        this.name = 'SnapshotVersionMismatchError';
        this.found = found;
    }
}

// Parses + validates the snapshot JSON, returning
// per-table parsed rows. Throws with a precise
// message identifying which table or row failed.
export function parseAndValidateSnapshot(
    json: string,
): Map<string, { id: string }[]> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error(
            'Invalid snapshot: not valid JSON.',
        );
    }
    if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
    ) {
        throw new Error(
            'Invalid snapshot: expected an object'
            + ' with table keys.',
        );
    }
    const record = parsed as Record<string, unknown>;
    // The version gate: BETWEEN the object-shape check above
    // and the TABLE_NAMES loop below, so no table is ever read
    // from a stale or unmarked export. Strict equality — an
    // absent key reads as undefined, which never equals the
    // numeric SNAPSHOT_SCHEMA_VERSION, so absence rejects
    // exactly like a mismatch. No fallback, no coercion.
    if (
        record[SNAPSHOT_SCHEMA_VERSION_KEY]
            !== SNAPSHOT_SCHEMA_VERSION
    ) {
        throw new SnapshotVersionMismatchError(
            record[SNAPSHOT_SCHEMA_VERSION_KEY],
        );
    }
    const result = new Map<string, { id: string }[]>();
    for (const table of TABLE_NAMES) {
        const rows = record[table];
        if (
            rows !== undefined
            && !Array.isArray(rows)
        ) {
            throw new Error(
                'Invalid snapshot: table "'
                + table + '" is not an array.',
            );
        }
        const rowArr =
            Array.isArray(rows) ? rows : [];
        const parsedRows: { id: string }[] = [];
        for (let i = 0; i < rowArr.length; i++) {
            const row = rowArr[i];
            if (
                typeof row !== 'object'
                || row === null
                || Array.isArray(row)
            ) {
                throw new Error(
                    'Invalid snapshot: row '
                    + i + ' in table "'
                    + table + '" is not an object.',
                );
            }
            const r = row as Record<string, unknown>;
            validateSnapshotRow(table, r, i);
            if (typeof r['id'] !== 'string') {
                throw new Error(
                    'Invalid snapshot: row '
                    + i + ' in table "'
                    + table
                    + '" missing string id.',
                );
            }
            parsedRows.push(r as { id: string });
        }
        result.set(table, parsedRows);
    }
    return result;
}
