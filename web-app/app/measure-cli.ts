// Pure CLI defaults and gates for ./measure.
// Consumed by measure.ts (Node harness) and unit tests.

export const DEFAULT_RUNS = 25;

export type MeasureCliFlags = {
    check: boolean;
    record: boolean;
    writeBudgets: boolean;
    visualize: boolean;
    profile: boolean;
    pages: string[] | null;
    runs: number;
    runsExplicit: boolean;
};

export function finalizeMeasureCli(
    f: MeasureCliFlags,
): { kind: 'ok'; cli: MeasureCliFlags }
    | { kind: 'error'; message: string } {
    // Partial record illegal (full registry only).
    if (f.record && f.pages !== null) {
        return {
            kind: 'error',
            message:
                '--record requires a full registry'
                + ' sweep (omit --pages)',
        };
    }
    // write-budgets also requires full registry.
    if (f.writeBudgets && f.pages !== null) {
        return {
            kind: 'error',
            message:
                '--write-budgets requires a full'
                + ' registry sweep (omit --pages)',
        };
    }
    // Bare → full ceremony: record + write-budgets
    // + visualize + DEFAULT_RUNS.
    const bare =
        !f.check
        && !f.record
        && !f.writeBudgets
        && !f.visualize
        && !f.profile
        && f.pages === null
        && !f.runsExplicit;
    if (bare) {
        return {
            kind: 'ok',
            cli: {
                ...f,
                record: true,
                writeBudgets: true,
                visualize: true,
                runs: DEFAULT_RUNS,
            },
        };
    }
    return { kind: 'ok', cli: f };
}
