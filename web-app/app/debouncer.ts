import { log } from './logger.ts';

export class Debouncer {
    #timer: ReturnType<
        typeof setTimeout
    > | undefined = undefined;
    #pending:
        | (() => void)
        | undefined = undefined;
    readonly #delayMs: number;
    #scheduleCount: number = 0;
    #burstStart: number = 0;

    constructor(delayMs: number) {
        this.#delayMs = delayMs;
    }

    schedule(fn: () => void): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
        } else {
            this.#scheduleCount = 0;
            this.#burstStart =
                performance.now();
        }
        this.#scheduleCount += 1;
        this.#pending = fn;
        const startedAt = this.#burstStart;
        const count = this.#scheduleCount;
        this.#timer = setTimeout(
            () => {
                this.#timer = undefined;
                this.#pending = undefined;
                const burstDurMs =
                    performance.now() - startedAt;
                const ratePerSec =
                    burstDurMs > 0
                        ? count / (burstDurMs / 1000)
                        : 0;
                const callStart =
                    performance.now();
                fn();
                const callDurMs =
                    performance.now() - callStart;
                log.info(
                    'flow save debouncer fire',
                    'debouncer',
                    {
                        delayMs: this.#delayMs,
                        burstSchedules: count,
                        burstDurMs:
                            Math.round(burstDurMs),
                        keystrokesPerSec:
                            Math.round(
                                ratePerSec * 10,
                            ) / 10,
                        callDurMs:
                            Math.round(
                                callDurMs * 100,
                            ) / 100,
                    },
                );
            },
            this.#delayMs,
        );
    }

    flush(): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
            this.#timer = undefined;
        }
        const pending = this.#pending;
        this.#pending = undefined;
        if (pending !== undefined) {
            const callStart =
                performance.now();
            pending();
            const callDurMs =
                performance.now() - callStart;
            log.info(
                'flow save debouncer flush',
                'debouncer',
                {
                    callDurMs:
                        Math.round(
                            callDurMs * 100,
                        ) / 100,
                },
            );
        }
    }
}
