import { GET } from '../../api/api.ts';
import { STARK_ORGANIZATION } from
    '../../api/mock-data/seed-constants.ts';
import { registryUrl } from
    '../../web-app/app/browser-drive.ts';
import {
    adminToken, type Origin, type Page, type Point,
} from './fixtures.ts';

export const CANVAS = 'svg.flow-canvas';
export const WRAP = '.flow-canvas-wrap';
export const NODE = '.flow-node';
export const EDGE = '.flow-edge';
export const ONBOARDING = 'Customer Onboarding';
export const LAYOUT_TEST =
    'Layout Test: Proposal Review Cycle';

type FlowRow = { id: string; name: string };
export type GraphNode = {
    id: string; name: string;
    positionX: number; positionY: number;
};
type FlowGraph = {
    graph: { nodes: GraphNode[]; edges: unknown[] };
};

function flowsPath(): string {
    return `organizations/${STARK_ORGANIZATION}/flows/`;
}

export async function flowIdNamed(
    origin: Origin, name: string,
): Promise<string> {
    const rows = await GET<FlowRow[]>(
        origin.db, flowsPath(), await adminToken(),
    );
    const row = rows.find((r) => r.name === name);
    if (row === undefined) {
        throw new Error(`no seeded flow named ${name}`);
    }
    return row.id;
}

export async function flowGraph(
    origin: Origin, flowId: string,
): Promise<FlowGraph> {
    return GET<FlowGraph>(
        origin.db, flowsPath() + flowId, await adminToken(),
    );
}

export async function openFlow(
    page: Page, origin: Origin, name: string,
): Promise<string> {
    const id = await flowIdNamed(origin, name);
    await page.navigate(registryUrl(
        origin.baseUrl, 'flow-detail', `flowId=${id}`,
    ));
    await page.ready('flow-detail');
    await page.waitFor(NODE);
    return id;
}

export function nodeIdNamed(
    page: Page, name: string,
): Promise<string> {
    return page.until<string>(
        `(() => {
            const n = [...document.querySelectorAll('${NODE}')]
                .find(el => (el.textContent || '')
                    .includes(${JSON.stringify(name)}));
            return n ? n.getAttribute('data-node-id') : null;
        })()`,
        `node named ${name}`,
    );
}

export function nodeCount(page: Page): Promise<number> {
    return page.evaluate<number>(
        `document.querySelectorAll('${NODE}').length`,
    );
}

export function edgeCount(page: Page): Promise<number> {
    return page.evaluate<number>(
        `document.querySelectorAll('${EDGE}').length`,
    );
}

export function portSelector(nodeId: string): string {
    return `${NODE}[data-node-id="${nodeId}"]`
        + ' [data-connect-port]';
}

export function nodeSelector(nodeId: string): string {
    return `${NODE}[data-node-id="${nodeId}"]`;
}

export function edgeLabelSelector(): string {
    return `${EDGE} rect`;
}

export async function doubleClick(
    page: Page, selector: string,
): Promise<void> {
    const p = await page.center(selector);
    await doubleClickAt(page, p);
}

export async function doubleClickAt(
    page: Page, pt: Point,
): Promise<void> {
    await page.press(pt);
    await page.release(pt);
    await page.press(pt);
    await page.release(pt);
}
