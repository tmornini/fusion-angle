// What each request sent, for a pin that counts requests
// and reads their preconditions (spec ## Testing: the
// latch, by counting requests).
export type SentRequest = {
    readonly method: string,
    readonly path: string,
    readonly ifMatch: string | null,
    readonly ifNoneMatch: string | null,
    readonly body: string | null,
};

export function recordingFetch(inner: typeof fetch): {
    readonly fetch: typeof fetch,
    readonly sent: SentRequest[],
} {
    const sent: SentRequest[] = [];
    return {
        sent,
        fetch: async (input, init) => {
            const request = new Request(input, init);
            const text = await request.clone().text();
            sent.push({
                method: request.method,
                path: new URL(request.url).pathname,
                ifMatch: request.headers.get('if-match'),
                ifNoneMatch: request.headers.get(
                    'if-none-match',
                ),
                body: text === '' ? null : text,
            });
            return inner(request);
        },
    };
}
