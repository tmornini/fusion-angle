// What each request sent, for a pin that counts requests
// and reads their preconditions (spec ## Testing: the
// latch, by counting requests).
export type SentRequest = {
    readonly method: string,
    readonly path: string,
    readonly ifMatch: string | null,
};

export function recordingFetch(inner: typeof fetch): {
    readonly fetch: typeof fetch,
    readonly sent: SentRequest[],
} {
    const sent: SentRequest[] = [];
    return {
        sent,
        fetch: (input, init) => {
            const request = new Request(input, init);
            sent.push({
                method: request.method,
                path: new URL(request.url).pathname,
                ifMatch: request.headers.get('if-match'),
            });
            return inner(request);
        },
    };
}
