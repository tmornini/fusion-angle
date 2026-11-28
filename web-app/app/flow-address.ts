// The Flows page's address naming the flow its panel holds.
// Every other query parameter — the organization stamp boot
// writes among them — stays.
const FLOW_PARAM = 'id';

export function flowAddress(href: string, id: string): string {
    const url = new URL(href);
    url.searchParams.set(FLOW_PARAM, id);
    return url.pathname + url.search + url.hash;
}
