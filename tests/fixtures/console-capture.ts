// Swap a console method for a recording stub for the span of
// one body — the shared voice for tests that deliberately
// drive paths whose designed behavior includes console
// evidence (redaction 500s, quota warns, recovery warns).
// Capturing keeps the suite's stderr clean; the returned
// calls let the test assert the evidence fired, because an
// unasserted log is one deletion away from a silent catch.

type CapturableConsoleMethod = 'warn' | 'error';

export async function captureConsole<T>(
    method: CapturableConsoleMethod,
    body: () => T | Promise<T>,
): Promise<{ result: T; calls: unknown[][] }> {
    const original = console[method];
    const calls: unknown[][] = [];
    console[method] = (...args: unknown[]): void => {
        calls.push(args);
    };
    try {
        const result = await body();
        return { result, calls };
    } finally {
        console[method] = original;
    }
}
