// The demo network-emulation seam, segregated from the
// storage contract (Interface Segregation): only the client
// verb facade awaits it before each simulated network hop —
// no store, decorator, or route handler ever does.
interface LatencySimulation {
    simulateLatency(): Promise<void>;
}

interface LatencyConfig {
    readonly mu: number;
    readonly sigma: number;
    readonly minMs: number;
    readonly maxMs: number;
}

const DEFAULT_LATENCY_CONFIG: LatencyConfig = {
    mu: Math.log(60),
    sigma: 0.5,
    minMs: 10,
    maxMs: 500,
};

const LOG_INPUT_FLOOR = 1e-10;

function sampleLogNormalMs(
    mu: number,
    sigma: number,
): number {
    const u1 = Math.max(
        Math.random(),
        LOG_INPUT_FLOOR,
    );
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1))
        * Math.cos(2 * Math.PI * u2);
    return Math.exp(mu + sigma * z);
}

async function simulateNetworkLatency(
    config: LatencyConfig,
): Promise<void> {
    const raw = sampleLogNormalMs(
        config.mu,
        config.sigma,
    );
    const delay = Math.max(
        config.minMs,
        Math.min(config.maxMs, raw),
    );
    await new Promise(
        (resolve) => setTimeout(resolve, delay),
    );
}

export {
    DEFAULT_LATENCY_CONFIG,
    simulateNetworkLatency,
};
export type { LatencyConfig, LatencySimulation };
