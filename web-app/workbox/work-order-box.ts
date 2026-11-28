import {
    $, $$, getRequiredAttribute, isFormField,
} from '../app/dom.ts';
import {
    html, setHtml, type SafeHtml,
} from '../app/safe-html.ts';
import { log } from '../app/logger.ts';
import {
    WorkboxDetailPresenter,
    buildWorkOrderBoxEmpty,
    buildWorkOrderBoxFailed,
    buildWorkOrderBoxLoading,
    type WorkOrderBinding,
} from '../app/presenters/index.ts';
import {
    INSTANCE_CONFLICT_NOTICE,
} from '../app/presenters/record-detail.ts';
import {
    extractErrorMessage,
    reportFault,
} from '../app/error-helpers.ts';
import { showToast } from '../app/toast.ts';
import {
    deleteWorkOrderClaim,
    fieldValuesByEventFromHistory,
    getMemberMap,
    getRecordAttributesByRecord,
    getRecordForWorkOrder,
    getRecordInstance,
    getWorkOrder,
    getWorkOrderVersions,
    isClaimedAndUnlapsed,
    postWorkOrderTransition,
    projectTransitions,
    putWorkOrderClaim,
    workOrderEventsOf,
    RecordTransitionViolations,
    type RecordAttribute,
    type RequestContext,
    type StateFieldValue,
    type TransitionEvent,
    type WorkOrder,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import { stepIsMine } from '../app/workbox-next.ts';
import type {
    Id,
    Member,
    NodeAttribute,
} from '../../shared/types.ts';
import {
    RequestError,
    HTTP_CONFLICT,
    HTTP_PRECONDITION_FAILED,
} from '../../shared/http-errors.ts';
import type { HttpMessage } from
    '../../shared/http-message/http-message.ts';

const LOAD_FAILED =
    'An unexpected error occurred. Please try again.';
const REFRESH_FAILED = 'Work order detail refresh failed';

// What the box reads for one work order: the presenter's
// inputs, and the two heads its writes latch — the work
// order's, and the bound instance's the form was filled
// from (WB19a / WB19b).
type WorkOrderRead = {
    readonly workOrder: WorkOrder;
    readonly transitions: readonly TransitionEvent[];
    readonly fieldValuesByEvent: ReadonlyMap<
        Id, readonly StateFieldValue[]
    >;
    readonly memberMap: Map<Id, Member>;
    readonly attributeMap: ReadonlyMap<
        string, RecordAttribute
    >;
    readonly instanceValues:
        ReadonlyMap<string, string> | null;
    readonly binding: WorkOrderBinding | null;
    readonly instance: HttpMessage | null;
};

// What the page hears from the box.
export interface WorkOrderBoxEvents {
    // A work order opened (its id), or the box closed.
    readonly opened: (id: string | null) => void;
    // A claim or release landed: the head it answered.
    readonly claimMoved: (moved: WorkOrder) => void;
    // A claim or release was refused.
    readonly claimRefused: () => void;
    // A transition sent the work order on to a step that
    // is not mine: the page picks the next one.
    readonly sentOn: (id: string) => void;
}

// The workbox's right box: one work order at a time, read
// and painted in place. Its claim button, its transitions,
// and its 412 recovery latch the heads it read.
export class WorkOrderBox {
    readonly #el: HTMLElement;
    readonly #memberId: string;
    readonly #events: WorkOrderBoxEvents;
    #openId: string | null = null;
    // The open work order's last read: the messages its
    // writes latch. Null while it loads or after it failed.
    #read: WorkOrderRead | null = null;
    #conflictNotice: string | null = null;
    // Bumped by every open, close, read, and claim: a read
    // that lands under an older number paints nothing.
    #sequence = 0;
    // The box's own write: the bell it rings repaints
    // nothing here, since the write's answer does.
    #writeInFlight = false;
    // Sent on and waiting for the page to pick the next
    // work order: no read of the old one may paint.
    #movingOn = false;

    constructor(
        el: HTMLElement,
        memberId: string,
        events: WorkOrderBoxEvents,
        signal: AbortSignal,
    ) {
        this.#el = el;
        this.#memberId = memberId;
        this.#events = events;
        setHtml(el, buildWorkOrderBoxEmpty());
        el.addEventListener('click', (e) => {
            this.#onClick(e);
        }, { signal });
    }

    openId(): string | null {
        return this.#openId;
    }

    // Whether the form holds something typed or picked that
    // opening another work order would drop.
    holdsEdits(): boolean {
        return $$('[data-attribute-id]', this.#el).some(isEdited);
    }

    // Opening never claims. The row already open opens
    // nothing new, so a stray click keeps typed values —
    // unless the box is waiting to move on from it.
    open(id: string): void {
        if (id === this.#openId && !this.#movingOn) {
            return;
        }
        this.#movingOn = false;
        this.#openId = id;
        this.#read = null;
        this.#conflictNotice = null;
        this.#events.opened(id);
        void this.#show(id, 'person');
    }

    close(): void {
        this.#sequence += 1;
        this.#movingOn = false;
        this.#openId = null;
        this.#read = null;
        this.#conflictNotice = null;
        const held = this.#el.contains(document.activeElement);
        setHtml(this.#el, buildWorkOrderBoxEmpty());
        // Focus the box held went with the content: it moves
        // to the box, which no repaint replaces. Focus the
        // person moved elsewhere while the page closed the
        // box stays there.
        if (held) {
            this.#el.focus({ preventScroll: true });
        }
        this.#events.opened(null);
    }

    // The bell: re-read the open work order in place, or
    // show it afresh if it never painted.
    reload(): void {
        if (
            this.#openId === null
            || this.#writeInFlight
            || this.#movingOn
        ) {
            return;
        }
        if (this.#read === null) {
            void this.#show(this.#openId, 'bell');
            return;
        }
        void this.#refresh(sessionContext(), this.#openId);
    }

    #onClick(e: MouseEvent): void {
        if (!(e.target instanceof Element)) return;
        if (e.target.closest('#work-order-close')) {
            this.close();
            return;
        }
        if (e.target.closest('[data-retry-btn]')) {
            void this.#show(this.#requireOpenId(), 'person');
            return;
        }
        const claimButton = e.target.closest(
            '#work-order-claim-btn',
        );
        if (claimButton instanceof HTMLButtonElement) {
            void this.#toggleClaim(claimButton);
            return;
        }
        const edge = e.target.closest('[data-edge-id]');
        if (edge) {
            void this.#transition(
                getRequiredAttribute(edge, 'data-edge-id'),
            );
        }
    }

    // A work order the box has not painted: the skeleton,
    // then the work order, or the failed state when its read
    // fails or the presenter cannot build it. Only the
    // person's own open or retry takes focus to Try Again
    // from elsewhere; the bell's takes it from nowhere, and
    // keeps the focus the box held.
    async #show(
        id: string,
        by: 'person' | 'bell',
    ): Promise<void> {
        this.#sequence += 1;
        const sequence = this.#sequence;
        const held = this.#el.contains(document.activeElement);
        setHtml(this.#el, buildWorkOrderBoxLoading());
        // Focus the box held stays in it while it loads.
        if (held) {
            this.#el.focus({ preventScroll: true });
        }
        // A work order opens at its top, wherever the box's
        // own scroll left the last one.
        this.#el.scrollTop = 0;
        let read: WorkOrderRead;
        try {
            read = await readWorkOrder(sessionContext(), id);
        } catch (err) {
            if (sequence !== this.#sequence) return;
            log.error('work order read failed', 'workbox', err);
            this.#paintFailed(err, by);
            return;
        }
        if (sequence !== this.#sequence) return;
        let page: SafeHtml;
        try {
            page = this.#pageOf(read);
        } catch (err) {
            log.error('work order build failed', 'workbox', err);
            this.#paintFailed(err, by);
            return;
        }
        this.#paint(read, page);
    }

    #paintFailed(err: unknown, by: 'person' | 'bell'): void {
        const held = this.#el.contains(document.activeElement);
        setHtml(this.#el, buildWorkOrderBoxFailed(
            extractErrorMessage(err, LOAD_FAILED),
        ));
        if (by === 'person' || held) {
            $('[data-retry-btn]', this.#el)?.focus();
        }
    }

    // A work order the box has painted, read again in
    // place: a failed read keeps what is painted and says
    // so.
    async #refresh(
        ctx: RequestContext,
        id: string,
    ): Promise<void> {
        const read = await this.#reread(ctx, id);
        if (read !== null) {
            this.#repaint(ctx, read, REFRESH_FAILED);
        }
    }

    // A painted work order's next read: null when it failed,
    // which it reports, or when a later gesture took the box.
    async #reread(
        ctx: RequestContext,
        id: string,
    ): Promise<WorkOrderRead | null> {
        this.#sequence += 1;
        const sequence = this.#sequence;
        let read: WorkOrderRead;
        try {
            read = await readWorkOrder(ctx, id);
        } catch (err) {
            if (sequence !== this.#sequence) return null;
            reportFault(ctx, REFRESH_FAILED, err);
            return null;
        }
        return sequence === this.#sequence ? read : null;
    }

    // A painted work order, painted again: a read the
    // presenter cannot build keeps what is painted and
    // reports the fault. True when it painted.
    #repaint(
        ctx: RequestContext,
        read: WorkOrderRead,
        fault: string,
    ): boolean {
        let page: SafeHtml;
        try {
            page = this.#pageOf(read);
        } catch (err) {
            reportFault(ctx, fault, err);
            return false;
        }
        this.#paint(read, page);
        return true;
    }

    // The read is the box's only once its page is built,
    // so a gesture never latches a read it could not show.
    #paint(read: WorkOrderRead, page: SafeHtml): void {
        this.#read = read;
        setHtml(this.#el, page);
    }

    // The presenter refuses a head its graph does not hold
    // and a history naming a node or an attribute it lacks.
    #pageOf(read: WorkOrderRead): SafeHtml {
        return this.#presenterOf(read).buildPage();
    }

    #presenterOf(read: WorkOrderRead): WorkboxDetailPresenter {
        return new WorkboxDetailPresenter(
            read.workOrder,
            read.transitions,
            read.fieldValuesByEvent,
            activeClaimOf(read.workOrder),
            read.memberMap,
            this.#memberId,
            read.attributeMap,
            read.instanceValues,
            read.binding,
            [],
            this.#conflictNotice,
        );
    }

    // Claim is a PUT, Release a DELETE, each latching the
    // head the box holds. The button is disabled while the
    // write is in flight, and the claim place changes only
    // when it answers. A refusal leaves it as it was, and
    // the lists and the box read again so the claim place
    // names who holds it.
    async #toggleClaim(
        button: HTMLButtonElement,
    ): Promise<void> {
        if (this.#writeInFlight) return;
        const read = this.#requireRead();
        const held = read.workOrder;
        // The gesture is the one the button names, whatever
        // this clock has done to the claim since it painted.
        const releasing =
            button.getAttribute('data-claim') === 'release';
        button.disabled = true;
        this.#writeInFlight = true;
        this.#sequence += 1;
        const sequence = this.#sequence;
        const ctx = sessionContext();
        let moved: WorkOrder;
        try {
            moved = releasing
                ? await deleteWorkOrderClaim(ctx, held)
                : await putWorkOrderClaim(ctx, held);
        } catch (err) {
            log.error(
                releasing ? 'release failed' : 'claim failed',
                'workbox', err,
            );
            showToast(refusalMessage(err, releasing), 'error');
            button.disabled = false;
            // A focused control that turns disabled loses
            // focus to <body> (the HTML focus fixup rule).
            // Unless the person has moved on, the button
            // takes it back now, so a re-read that fails
            // leaves focus where they pressed.
            const active = document.activeElement;
            if (
                active === null
                || active === document.body
                || active === button
            ) {
                button.focus();
            }
            this.#events.claimRefused();
            if (sequence === this.#sequence) {
                void this.#rereadRefused(ctx, held.id);
            }
            return;
        } finally {
            this.#writeInFlight = false;
        }
        this.#events.claimMoved(moved);
        if (sequence !== this.#sequence) return;
        const mayTakeFocus = this.#mayTakeFocus();
        if (
            this.#repaint(
                ctx, { ...read, workOrder: moved }, REFRESH_FAILED,
            )
            && mayTakeFocus
        ) {
            $('#work-order-claim-btn', this.#el)?.focus();
        }
    }

    // A write's answer takes focus only when none is held or
    // it is still in the box: the disabled button dropped it,
    // or the button pressed is about to be repainted away.
    // Focus the person put elsewhere meanwhile stays there.
    #mayTakeFocus(): boolean {
        const active = document.activeElement;
        return active === null
            || active === document.body
            || this.#el.contains(active);
    }

    // A refused claim's re-read names who holds the work
    // order now. If the box held focus, the button it
    // repainted takes it back, or the box does when a
    // member's name stands alone in its place; focus the
    // person moved elsewhere meanwhile stays there.
    async #rereadRefused(
        ctx: RequestContext,
        id: string,
    ): Promise<void> {
        const read = await this.#reread(ctx, id);
        if (read === null) return;
        const held = this.#el.contains(document.activeElement);
        if (!this.#repaint(ctx, read, REFRESH_FAILED) || !held) {
            return;
        }
        const button = $('#work-order-claim-btn', this.#el);
        if (button) {
            button.focus();
            return;
        }
        this.#el.focus({ preventScroll: true });
    }

    // A transition: the required check, the violations
    // banner, the 412 recovery, and the write that latches
    // the head and the instance the form was filled from.
    // After it lands the bell refreshes the lists, and the
    // box stays on a step that is mine or moves on (spec
    // "After a transition").
    async #transition(edgeId: string): Promise<void> {
        if (this.#writeInFlight) return;
        const read = this.#requireRead();
        const detail = this.#presenterOf(read);
        const values = collectAttributeValues(this.#el);
        if (
            hasEmptyRequiredAttribute(
                detail.renderableAttributes(), values,
            )
        ) {
            showToast(
                'Please fill all required attributes',
                'error',
            );
            return;
        }
        const violationsEl = $(
            '#transition-violations', this.#el,
        );
        if (violationsEl) {
            setHtml(violationsEl, html``);
        }
        // One vessel per gesture: submit, 412 recovery
        // GET, and re-present share the same requestId
        // (D8).
        const ctx = sessionContext();
        this.#writeInFlight = true;
        let moved: WorkOrder;
        try {
            moved = await postWorkOrderTransition(ctx, {
                workOrder: read.workOrder,
                edgeId,
                values,
                ...(read.instance === null
                    ? {}
                    : { instance: read.instance }),
            });
        } catch (err) {
            if (err instanceof RecordTransitionViolations) {
                if (violationsEl) {
                    setHtml(
                        violationsEl,
                        detail.buildViolations(err.violations),
                    );
                }
                return;
            }
            if (
                err instanceof RequestError
                && err.status === HTTP_PRECONDITION_FAILED
            ) {
                void this.#recoverFrom412(
                    ctx, read.workOrder.id,
                );
                return;
            }
            reportFault(ctx, 'Work order transition failed', err);
            return;
        } finally {
            this.#writeInFlight = false;
        }
        showToast('Transition complete', 'success');
        // A row opened or the box closed while the write was
        // in flight is where the box stays; the write's own
        // bell refreshes the lists.
        if (moved.id !== this.#openId) return;
        // The button pressed is about to be repainted away:
        // focus moves to the box, which no repaint replaces.
        if (this.#mayTakeFocus()) {
            this.#el.focus({ preventScroll: true });
        }
        // A step that is mine shows afresh: the skeleton
        // leaves the old step nothing to press, and a read
        // that fails takes the failed state with Try Again.
        if (stepIsMine(moved, this.#memberId)) {
            this.#read = null;
            void this.#show(moved.id, 'person');
            return;
        }
        this.#moveOn(moved.id);
    }

    // Sent on to a step that is not mine: the box shows its
    // skeleton, and no read of the old work order may paint,
    // while the page refreshes its lists and picks the next.
    #moveOn(id: string): void {
        this.#sequence += 1;
        this.#read = null;
        this.#movingOn = true;
        setHtml(this.#el, buildWorkOrderBoxLoading());
        this.#events.sentOn(id);
    }

    // A stale head or instance: read again, re-present with
    // the conflict notice, warn, and never retry the write.
    async #recoverFrom412(
        ctx: RequestContext,
        id: string,
    ): Promise<void> {
        if (id !== this.#openId) return;
        this.#conflictNotice = INSTANCE_CONFLICT_NOTICE;
        this.#sequence += 1;
        const sequence = this.#sequence;
        let read: WorkOrderRead;
        try {
            read = await readWorkOrder(ctx, id);
        } catch (err) {
            reportFault(ctx, 'Failed to refresh work order', err);
            return;
        }
        if (sequence !== this.#sequence) return;
        if (this.#repaint(ctx, read, 'Failed to refresh work order')) {
            showToast(INSTANCE_CONFLICT_NOTICE, 'warning');
        }
    }

    // The claim and transition buttons exist only on a
    // painted work order, so its read is on hand.
    #requireRead(): WorkOrderRead {
        if (this.#read === null) {
            throw new Error('workbox: a box gesture before its read');
        }
        return this.#read;
    }

    // Try Again shows only while a work order is open.
    #requireOpenId(): string {
        if (this.#openId === null) {
            throw new Error('workbox: Try Again with nothing open');
        }
        return this.#openId;
    }
}

// Wave 1: the head, its versions, the members, and the
// record, side by side; wave 2: the record's attributes
// beside the bound instance's head. The present is the
// head; the timeline is the versions' events in chain
// order; live form values come from the instance.
async function readWorkOrder(
    ctx: RequestContext,
    id: string,
): Promise<WorkOrderRead> {
    const [workOrder, versions, memberMap, recordId] =
        await Promise.all([
            getWorkOrder(ctx, id),
            getWorkOrderVersions(ctx, id),
            getMemberMap(ctx),
            getRecordForWorkOrder(ctx, id),
        ]);
    const binding = bindingOf(workOrder);
    const [attributes, instance] = await Promise.all([
        recordId === null
            ? Promise.resolve<RecordAttribute[]>([])
            : getRecordAttributesByRecord(ctx, recordId),
        binding === null
            ? Promise.resolve(null)
            : getRecordInstance(
                ctx, binding.recordTypeId, binding.instanceId,
            ),
    ]);
    const events = workOrderEventsOf(versions);
    return {
        workOrder,
        transitions: projectTransitions(id, events),
        fieldValuesByEvent:
            fieldValuesByEventFromHistory(events),
        memberMap,
        attributeMap: new Map(
            attributes.map((a) => [a.id, a] as const),
        ),
        instanceValues:
            instance === null ? null : instance.values,
        binding,
        instance: instance === null ? null : instance.message,
    };
}

function bindingOf(
    workOrder: WorkOrder,
): WorkOrderBinding | null {
    return workOrder.instanceId !== undefined
        && workOrder.recordTypeId !== undefined
        ? {
            instanceId: workOrder.instanceId,
            recordTypeId: workOrder.recordTypeId,
        }
        : null;
}

// The head's claim while it is live; a lapsed claim is no
// claim.
function activeClaimOf(
    workOrder: WorkOrder,
): { memberId: Id; at: string } | null {
    return isClaimedAndUnlapsed(workOrder.claim)
        ? {
            memberId: workOrder.claim.memberId,
            at: workOrder.claim.at,
        }
        : null;
}

function refusalMessage(
    err: unknown,
    releasing: boolean,
): string {
    if (err instanceof RequestError && err.status === HTTP_CONFLICT) {
        return 'Someone else holds that work order';
    }
    return releasing
        ? 'Failed to release work order'
        : 'Failed to claim work order';
}

// A control that no longer shows what it was painted with.
function isEdited(el: Element): boolean {
    if (el instanceof HTMLSelectElement) {
        const painted = [...el.options].find(
            (option) => option.defaultSelected,
        );
        return el.value !== (painted?.value ?? '');
    }
    if (el instanceof HTMLInputElement) {
        return el.type === 'checkbox' || el.type === 'radio'
            ? el.checked !== el.defaultChecked
            : el.value !== el.defaultValue;
    }
    return false;
}

function collectAttributeValues(
    container: HTMLElement,
): Record<string, string> {
    const values: Record<string, string> =
        {};
    const inputs = $$(
        '[data-attribute-id]', container,
    );
    for (const input of inputs) {
        if (!isFormField(input)) continue;
        const attributeId = getRequiredAttribute(
            input, 'data-attribute-id',
        );
        if (input.type === 'radio') {
            if ((input as HTMLInputElement).checked) {
                values[attributeId] = input.value;
            }
        } else if (input.type === 'checkbox') {
            values[attributeId] = (
                input as HTMLInputElement
            ).checked
                ? 'true'
                : 'false';
        } else {
            values[attributeId] =
                input.value.trim();
        }
    }
    return values;
}

function hasEmptyRequiredAttribute(
    refs: readonly NodeAttribute[],
    values: Record<string, string>,
): boolean {
    return refs
        .filter(r => r.isRequired)
        .some(r => {
            const v = values[r.attributeId];
            return v === undefined || v === '';
        });
}
