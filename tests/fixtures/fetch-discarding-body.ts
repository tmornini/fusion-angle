// A fetch whose response body is cancelled before the
// caller sees it — for the tests that assert only on status
// and headers. An unread body is an open ReadableStream the
// runtime holds until the process exits, which the resource
// sanitizer reports as a leak; cancelling releases it while
// leaving status and headers readable. Reach for plain
// `fetch` whenever the body is part of what the test proves.

export async function fetchDiscardingBody(
    input: string | URL | Request,
    init?: RequestInit,
): Promise<Response> {
    const response = await fetch(input, init);
    await response.body?.cancel();
    return response;
}
