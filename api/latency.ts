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

function sampleLogNormalMs(
    mu: number,
    sigma: number,
): number {
    const u1 = Math.max(Math.random(), 1e-10);
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

function withSimulatedLatency<T extends object>(
    target: T,
    config: LatencyConfig,
): T {
    return new Proxy(target, {
        get(obj, prop, receiver) {
            const value = Reflect.get(
                obj,
                prop,
                receiver,
            );
            if (typeof value === 'function') {
                return async (
                    ...args: unknown[]
                ) => {
                    await simulateNetworkLatency(
                        config,
                    );
                    return (
                        value as (
                            ...a: unknown[]
                        ) => unknown
                    ).apply(obj, args);
                };
            }
            if (
                typeof value === 'object'
                && value !== null
                && !Array.isArray(value)
            ) {
                return withSimulatedLatency(
                    value,
                    config,
                );
            }
            return value;
        },
    });
}

export {
    DEFAULT_LATENCY_CONFIG,
    simulateNetworkLatency,
    withSimulatedLatency,
};
export type { LatencyConfig };
