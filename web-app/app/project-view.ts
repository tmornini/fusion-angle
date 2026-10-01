import type {
    ObjectiveEntity,
    ObjectiveId,
    Project,
    ProjectState,
} from '../../shared/types.ts';
import {
    COST_DIVISOR,
    MS_PER_DAY,
    msSinceUtc,
} from '../../shared/types.ts';
import {
    latestPerPair,
    weightedMeanByPosition,
} from './scoring-format.ts';
import type { ObjectiveScore } from
    '../../client/project-scoring.ts';
import type { HttpMessage } from
    '../../shared/http-message/http-message.ts';

export class ProjectView {
    readonly #project: Project;
    readonly #impactBaselineMean: number | null;
    readonly #impactActualMean: number | null;

    constructor(
        project: Project,
        objectives: readonly HttpMessage<ObjectiveEntity>[],
        baselineScores: readonly ObjectiveScore[],
        actualScores: readonly ObjectiveScore[],
    ) {
        this.#project = project;
        const posByObj =
            new Map<ObjectiveId, number>(
                objectives.map(m => {
                    const o = m.body().toValue();
                    return [o.id, o.position];
                }),
            );
        const latestB = latestPerPair(baselineScores);
        this.#impactBaselineMean =
            weightedMeanByPosition(latestB, posByObj);
        const baselinedIds = new Set(
            latestB.map(b => b.objectiveId),
        );
        const latestA = latestPerPair(actualScores);
        const actualedIds = new Set(
            latestA.map(a => a.objectiveId),
        );
        const fullyActualScored =
            latestB.length > 0
            && Array.from(baselinedIds).every(
                id => actualedIds.has(id),
            );
        this.#impactActualMean = fullyActualScored
            ? weightedMeanByPosition(
                latestA.filter(
                    a => baselinedIds.has(
                        a.objectiveId,
                    ),
                ),
                posByObj,
            )
            : null;
    }

    idForLink(): string {
        return this.#project.idForLink();
    }

    titleText(): string {
        return this.#project.titleText();
    }

    descriptionText(): string {
        return this.#project
            .descriptionText();
    }

    stateValue(): ProjectState {
        return this.#project
            .stateValue();
    }

    isApproved(): boolean {
        return this.#project
            .isApproved();
    }

    progressPercent(): number {
        return this.#project
            .timelineProgress();
    }

    startDateValue(): string {
        return this.#project
            .startDateValue();
    }

    targetEndDateValue(): string {
        return this.#project
            .targetEndDateValue();
    }

    timeBaselineDays(): number {
        const start = new Date(
            this.#project
                .startDateValue(),
        ).getTime();
        const end = new Date(
            this.#project
                .targetEndDateValue(),
        ).getTime();
        if (isNaN(start) || isNaN(end))
            return 0;
        return Math.max(0, Math.ceil(
            (end - start)
            / (MS_PER_DAY),
        ));
    }

    timeActualDays(): number {
        const elapsed = msSinceUtc(
            this.#project
                .startDateValue(),
        );
        if (isNaN(elapsed)) return 0;
        return Math.max(0, Math.floor(
            elapsed / MS_PER_DAY,
        ));
    }

    costBaselineK(): number {
        return this.#project
            .estimatedCostAmount()
            / COST_DIVISOR;
    }

    costActualK(): number {
        return this.#project
            .actualCostAmount()
            / COST_DIVISOR;
    }

    impactBaselineMean(): number | null {
        return this.#impactBaselineMean;
    }

    impactActualMean(): number | null {
        return this.#impactActualMean;
    }
}
