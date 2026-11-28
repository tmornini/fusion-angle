// The Records page's address naming the record its panel
// holds. A linked instance belongs to the record the link
// opened, so naming a record drops it. Every other query
// parameter — the organization stamp boot writes among
// them — stays.
const RECORD_PARAM = 'id';
const INSTANCE_PARAM = 'instance';

export function recordAddress(href: string, id: string): string {
    const url = new URL(href);
    url.searchParams.set(RECORD_PARAM, id);
    url.searchParams.delete(INSTANCE_PARAM);
    return url.pathname + url.search + url.hash;
}
