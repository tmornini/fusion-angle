import type { DbAdapter } from './db.ts';
import type {
    HumanWorkerEntity,
    WorkerState,
    IdeaEntity,
    ProjectEntity,
    IdeaSubmissionEntity,
    FlowEntity,
    ProjectFlowEntity,
    AIWorkerEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateEntity,
    StateFieldValueEntity,
    JsonObjectField,
    Id,
    GraphNode,
    GraphEdge,
} from './types.ts';
import {
    jsonArrayField,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
    SECONDS_PER_HOUR,
    MS_PER_SECOND,
    MS_PER_DAY,
    SYSTEM_WORKER_ID,
} from './types.ts';

const now = new Date();

const TIER_PROJECTS_LIMIT = 50;
const TIER_IDEAS_LIMIT = 200;

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function dt(
    daysAgo: number,
    hour: number,
    minute: number,
): string {
    const d = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysAgo,
        hour,
        minute,
    ));
    const year = d.getUTCFullYear();
    const month = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    const hours = pad(d.getUTCHours());
    const minutes = pad(d.getUTCMinutes());
    return `${year}-${month}-${day}`
        + `T${hours}:${minutes}:00.000000Z`;
}

const MS_PER_HOUR =
    SECONDS_PER_HOUR * MS_PER_SECOND;
const CREATE_DWELL_MS = 1000;

function mulberry32(
    seed: number,
): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(
            t ^ (t >>> 15), t | 1,
        );
        t ^= t + Math.imul(
            t ^ (t >>> 7), t | 61,
        );
        return (
            (t ^ (t >>> 14)) >>> 0
        ) / 4294967296;
    };
}

function sampleUniform(
    rng: () => number,
    lo: number,
    hi: number,
): number {
    return lo + (hi - lo) * rng();
}

function sampleNormal(
    rng: () => number,
    mean: number,
    sigma: number,
): number {
    const u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1))
        * Math.cos(2 * Math.PI * u2);
    return mean + sigma * z;
}

function sampleLogNormal(
    rng: () => number,
    meanHours: number,
    sigma: number,
): number {
    const z = sampleNormal(rng, 0, 1);
    return Math.exp(
        Math.log(meanHours) + sigma * z,
    );
}

function pickWeighted<T>(
    rng: () => number,
    items: readonly T[],
    weightOf: (t: T) => number,
): T {
    let total = 0;
    for (const it of items) {
        total += weightOf(it);
    }
    const r = rng() * total;
    let cum = 0;
    for (const it of items) {
        cum += weightOf(it);
        if (r <= cum) return it;
    }
    return items[items.length - 1]!;
}

const B62_ALPHABET =
    'abcdefghijklmnopqrstuvwxyz'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    + '0123456789';

function b62Id(
    rng: () => number,
    len: number,
): string {
    let s = '';
    for (let i = 0; i < len; i++) {
        const idx = Math.floor(
            rng() * B62_ALPHABET.length,
        );
        s += B62_ALPHABET[idx];
    }
    return s;
}

function isoFromMs(ms: number): string {
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hour = pad(date.getUTCHours());
    const minute = pad(date.getUTCMinutes());
    const second = pad(date.getUTCSeconds());
    return `${year}-${month}-${day}`
        + `T${hour}:${minute}:${second}.000000Z`;
}

interface FlowSeedSpec {
    readonly flowId: Id;
    readonly name: string;
    readonly description: string;
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly creator: GraphNode;
    readonly archive: GraphNode;
}

interface PathProfile {
    readonly nodeIds: readonly Id[];
    readonly edgeIds: readonly Id[];
    readonly weight: number;
}

interface SojournProfile {
    readonly meanHoursByNodeId:
        ReadonlyMap<Id, number>;
    readonly sigmaByNodeId:
        ReadonlyMap<Id, number>;
}

interface WorkerSkill {
    readonly byWorkerAndNode:
        ReadonlyMap<
            Id,
            ReadonlyMap<Id, number>
        >;
    readonly jitterPct: number;
}

interface GeneratedFlowData {
    readonly workOrders:
        readonly WorkOrderEntity[];
    readonly flowWorkOrders:
        readonly FlowWorkOrderEntity[];
    readonly stateEvents:
        readonly StateEntity[];
}

function generateFlowWorkload(args: {
    readonly flow: FlowSeedSpec;
    readonly paths: readonly PathProfile[];
    readonly sojourn: SojournProfile;
    readonly skill: WorkerSkill;
    readonly totalWorkOrders: number;
    readonly oldestDaysAgo: number;
    readonly newestDaysAgo: number;
    readonly seed: number;
}): GeneratedFlowData {
    const {
        flow, paths, sojourn, skill,
        totalWorkOrders, oldestDaysAgo,
        newestDaysAgo, seed,
    } = args;

    const rng = mulberry32(seed);
    const nodeById = new Map(
        flow.nodes.map(n => [n.id, n]),
    );
    const creatorId = flow.creator.id;
    const archiveId = flow.archive.id;

    const frozenFlowGraph = jsonObjectField({
        flowId: flow.flowId,
        name: flow.name,
        description: flow.description,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: flow.nodes,
        edges: flow.edges,
    });

    const workOrders: WorkOrderEntity[] = [];
    const flowWorkOrders:
        FlowWorkOrderEntity[] = [];
    const stateEvents: StateEntity[] = [];

    const nowMs = now.getTime();

    for (let i = 0; i < totalWorkOrders; i++) {
        const woId = b62Id(rng, 22);
        const displayId = b62Id(rng, 8);
        const path = pickWeighted(
            rng, paths, p => p.weight,
        );
        const N = path.nodeIds.length;

        const createdAtDaysAgo = sampleUniform(
            rng, newestDaysAgo, oldestDaysAgo,
        );
        const createdAtMs =
            nowMs - createdAtDaysAgo * MS_PER_DAY;
        let cursorMs = createdAtMs;

        const stepWorker: (Id | null)[] = [];
        for (const nid of path.nodeIds) {
            if (
                nid === creatorId
                || nid === archiveId
            ) {
                stepWorker.push(null);
                continue;
            }
            const node = nodeById.get(nid)!;
            stepWorker.push(pickWeighted(
                rng, node.workerIds, () => 1,
            ));
        }

        const stepSojournMs: number[] = [];
        for (let j = 0; j < N; j++) {
            const nid = path.nodeIds[j]!;
            if (
                nid === creatorId
                || nid === archiveId
            ) {
                stepSojournMs.push(0);
                continue;
            }
            const mean =
                sojourn.meanHoursByNodeId
                    .get(nid)!;
            const sigma =
                sojourn.sigmaByNodeId
                    .get(nid)!;
            const worker = stepWorker[j]!;
            const sk = skill.byWorkerAndNode
                .get(worker)!.get(nid)!;
            const jit = sampleUniform(
                rng,
                1 - skill.jitterPct,
                1 + skill.jitterPct,
            );
            const hours = sampleLogNormal(
                rng, mean, sigma,
            ) * sk * jit;
            stepSojournMs.push(
                hours * MS_PER_HOUR,
            );
        }

        // The worker who takes the WO into the
        // first working node also stamps the
        // Create-entry and Create-exit state
        // events.
        const creatorPerson = stepWorker[1]!;

        stateEvents.push({
            id: b62Id(rng, 22),
            entity_id: woId,
            state: path.nodeIds[0]!,
            worker_id: creatorPerson,
            at: isoFromMs(cursorMs),
        });

        if (N >= 2) {
            cursorMs += CREATE_DWELL_MS;
            stateEvents.push({
                id: b62Id(rng, 22),
                entity_id: woId,
                state: path.nodeIds[1]!,
                worker_id: creatorPerson,
                at: isoFromMs(cursorMs),
            });
        }

        for (let j = 2; j < N; j++) {
            cursorMs += stepSojournMs[j - 1]!;
            // Clamp long-tail sojourns that
            // would overrun today, so no
            // event is future-dated.
            if (cursorMs >= nowMs) {
                cursorMs = nowMs - 1000;
            }
            stateEvents.push({
                id: b62Id(rng, 22),
                entity_id: woId,
                state: path.nodeIds[j]!,
                worker_id: stepWorker[j - 1]!,
                at: isoFromMs(cursorMs),
            });
        }

        workOrders.push({
            id: woId,
            display_id: displayId,
            flow_graph: frozenFlowGraph,
            position: i + 1,
        });
        flowWorkOrders.push({
            id: b62Id(rng, 22),
            flow_id: flow.flowId,
            work_order_id: woId,
            at:
                isoFromMs(createdAtMs),
        });
    }

    return {
        workOrders,
        flowWorkOrders,
        stateEvents,
    };
}

type SeedHumanWorker = Omit<
    HumanWorkerEntity,
    'strengths' | 'team_dimensions'
> & {
    strengths: string[];
    team_dimensions: Record<
        string, number
    >;
    // The initial worker state seeded into the
    // states log alongside the row. Lives on the
    // seed (not the entity) because the entity
    // carries no state column.
    state: WorkerState;
};

const MOCK_SEED_TIMESTAMP =
    '2026-01-01T00:00:00.000Z';

export const OBJECTIVE_SEEDS: Array<{
    id: string;
    position: number;
    name: string;
    description: string;
}> = [
    {
        id: 'JkW7aEqFdX3nOiPtVhMrCy',
        position: 1,
        name: 'Lower expenses',
        description: 'Reduce operational outlay across the business',
    },
    {
        id: 'RgT2mNvKpQ8xLsYwBzHcUe',
        position: 2,
        name: 'Increase incomes',
        description: 'Grow top-line through new and existing channels',
    },
    {
        id: 'bDf6uStZlA9eGmYjIoNcWq',
        position: 3,
        name: 'Raise customer NPS',
        description: 'Lift Net Promoter Score across the journey',
    },
    {
        id: 'CvH4wRnXkU1pQsBgTyEzMo',
        position: 4,
        name: 'Improve employee morale',
        description: 'Make daily work energizing and sustainable',
    },
];

export async function populateMockData(
    adapter: DbAdapter,
): Promise<void> {
    const workers: SeedHumanWorker[] = [
        {
            id: SYSTEM_WORKER_ID,
            first_name: 'System',
            last_name: 'Worker',
            email: 'system@fusion.local',
            title: 'System',
            department: 'System',
            state: 'active',
            strengths: [],
            team_dimensions: {},
            phone: '',
            bio: 'Synthetic worker that owns'
                + ' system-authored state events.',
        },
        {
            id: 'LhfaUUf4IumVsCSGB4xjdK',
            first_name: 'Sarah',
            last_name: 'Chen',
            email: 'sarah.chen@company.com',
            title: 'Project Lead',
            department: 'Operations',
            state: 'active',
            strengths: [
                'Strategic Planning',
                'Team Leadership',
                'Risk Management',
            ],
            team_dimensions: {
                driver: 78,
                analytical: 85,
                expressive: 62,
                amiable: 70,
            },
            phone: '+1 (555) 201-3847',
            bio: 'Operations leader who'
                + ' thrives on aligning'
                + ' cross-functional teams'
                + ' around strategic goals.',
        },
        {
            id: 'bLP3X1hb1mSz8gY9neogU3',
            first_name: 'Mike',
            last_name: 'Thompson',
            email: 'mike.thompson@company.com',
            title: 'ML Engineer',
            department: 'Engineering',
            state: 'active',
            strengths: [
                'Machine Learning',
                'Python',
                'Data Architecture',
            ],
            team_dimensions: {
                driver: 55,
                analytical: 95,
                expressive: 40,
                amiable: 58,
            },
            phone: '+1 (555) 318-7642',
            bio: 'ML engineer focused on'
                + ' scalable data pipelines'
                + ' and production-grade'
                + ' model deployment.',
        },
        {
            id: 'zyTbfbjcGEfbpCsNTP0XjX',
            first_name: 'Jessica',
            last_name: 'Park',
            email: 'jessica.park@company.com',
            title: 'Data Scientist',
            department: 'Analytics',
            state: 'active',
            strengths: [
                'Statistical Analysis',
                'Visualization',
                'Predictive Modeling',
            ],
            team_dimensions: {
                driver: 45,
                analytical: 92,
                expressive: 68,
                amiable: 75,
            },
            phone: '+1 (555) 429-0153',
            bio: 'Data scientist passionate'
                + ' about turning complex'
                + ' datasets into actionable'
                + ' business insights.',
        },
        {
            id: '6xBfK5If82JKfThXb1wlzS',
            first_name: 'David',
            last_name: 'Martinez',
            email: 'david.martinez@company.com',
            title: 'Backend Developer',
            department: 'Engineering',
            state: 'active',
            strengths: [
                'API Development',
                'Database Design',
                'System Integration',
            ],
            team_dimensions: {
                driver: 70,
                analytical: 82,
                expressive: 35,
                amiable: 55,
            },
            phone: '+1 (555) 537-8216',
            bio: 'Backend developer who'
                + ' builds reliable APIs'
                + ' and loves optimizing'
                + ' database performance.',
        },
        {
            id: '53J8h9dr76XFqCjYcNVwIR',
            first_name: 'Emily',
            last_name: 'Rodriguez',
            email: 'emily.rodriguez@company.com',
            title: 'UX Designer',
            department: 'Design',
            state: 'pending',
            strengths: [
                'User Research',
                'Prototyping',
                'Design Systems',
            ],
            team_dimensions: {
                driver: 50,
                analytical: 72,
                expressive: 88,
                amiable: 85,
            },
            phone: '+1 (555) 642-9374',
            bio: 'UX designer dedicated to'
                + ' crafting intuitive'
                + ' experiences grounded in'
                + ' user research.',
        },
        {
            id: 'I5ntELi16X3N3JYCCnxMjZ',
            first_name: 'Alex',
            last_name: 'Kim',
            email: 'alex.kim@company.com',
            title: 'Product Manager',
            department: 'Product',
            state: 'active',
            strengths: [
                'Roadmap Planning',
                'Stakeholder Management',
                'Agile Methods',
            ],
            team_dimensions: {
                driver: 85,
                analytical: 70,
                expressive: 78,
                amiable: 65,
            },
            phone: '+1 (555) 753-1048',
            bio: 'Product manager skilled at'
                + ' translating customer'
                + ' needs into clear'
                + ' roadmaps.',
        },
        {
            id: 'WxQn4LVWb76YkmqK5B0EPp',
            first_name: 'Marcus',
            last_name: 'Johnson',
            email: 'marcus@acmecorp.com',
            title: 'manager',
            department: 'Product',
            state: 'active',
            strengths: [
                'Product Strategy',
                'Team Management',
            ],
            team_dimensions: {
                driver: 75,
                analytical: 65,
                expressive: 80,
                amiable: 70,
            },
            phone: '+1 (555) 864-2390',
            bio: 'Product strategy manager'
                + ' with a knack for'
                + ' spotting market gaps'
                + ' and coaching teams.',
        },
        {
            id: 'jBoWiyWxj7pp4sG3JgX5l2',
            first_name: 'David',
            last_name: 'Kim',
            email: 'david.kim@company.com',
            title: 'member',
            department: 'Engineering',
            state: 'active',
            strengths: [
                'Frontend Development',
                'React',
                'TypeScript',
            ],
            team_dimensions: {
                driver: 60,
                analytical: 78,
                expressive: 55,
                amiable: 65,
            },
            phone: '+1 (555) 975-4831',
            bio: 'Frontend developer who'
                + ' cares deeply about'
                + ' performance and'
                + ' accessible UI patterns.',
        },
        {
            id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            first_name: 'Lisa',
            last_name: 'Wang',
            email: 'lisa@acmecorp.com',
            title: 'viewer',
            department: 'Sales',
            state: 'active',
            strengths: [
                'Sales Strategy',
                'Client Relations',
            ],
            team_dimensions: {
                driver: 80,
                analytical: 55,
                expressive: 85,
                amiable: 75,
            },
            phone: '+1 (555) 086-5712',
            bio: 'Sales strategist who'
                + ' builds lasting client'
                + ' relationships through'
                + ' consultative selling.',
        },
        {
            id: 'oU0bIe0eUC33mTbZrxdogC',
            first_name: 'James',
            last_name: 'Miller',
            email: 'james@acmecorp.com',
            title: 'member',
            department: 'Engineering',
            state: 'archived',
            strengths: [
                'Backend Development',
                'Python',
            ],
            team_dimensions: {
                driver: 55,
                analytical: 82,
                expressive: 40,
                amiable: 50,
            },
            phone: '+1 (555) 197-3064',
            bio: 'Backend engineer with'
                + ' strong Python skills'
                + ' and a focus on clean'
                + ' architecture.',
        },
        {
            id: 'current',
            first_name: 'Tony',
            last_name: 'Stark',
            email: 'demo@example.com',
            title: 'Admin',
            department: 'Product',
            state: 'active',
            strengths: [
                'Strategic Planning',
                'Data Analysis',
                'Stakeholder Management',
            ],
            team_dimensions: {
                driver: 80,
                analytical: 80,
                expressive: 80,
                amiable: 80,
            },
            phone: '+1 (555) 123-4567',
            bio: 'Passionate about building'
                + ' products that solve'
                + ' real problems.',
        },
    ];

    await Promise.all(workers.map(worker => {
        const {
            id: _id, state: _state, ...rest
        } = worker;
        return adapter.workers.put(worker.id, {
            ...rest,
            strengths:
                jsonArrayField(worker.strengths),
            team_dimensions:
                jsonObjectField(
                    worker.team_dimensions,
                ),
        });
    }));

    // Initial worker state events. Every seeded
    // worker — human or AI — gets one event at
    // creation. The states log is the sole source
    // of worker state; the row carries no column.
    const workerStateEvents: StateEntity[] = [
        ...workers.map(w => ({
            id: `seed-worker-${w.id}-${w.state}`,
            entity_id: w.id,
            state: w.state,
            worker_id: SYSTEM_WORKER_ID,
            at: MOCK_SEED_TIMESTAMP,
        })),
    ];

    const ideas: IdeaEntity[] = [
        {
            id: 'eT5xdKjzLDmuRn3r7XMX4R',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            position: 1,
            problem_statement:
                'Marketing team spends 20+'
                + ' hours weekly manually'
                + ' segmenting customers,'
                + ' leading to delayed'
                + ' campaigns and missed'
                + ' opportunities.',
            target_users:
                'Marketing team,'
                + ' campaign managers,'
                + ' data analysts',
            proposed_solution:
                'Implement machine learning'
                + ' model to automatically'
                + ' segment customers based'
                + ' on behavior patterns.',
            expected_outcome:
                'Reduce segmentation time'
                + ' by 80% and increase'
                + ' conversion rates'
                + ' by 25%.',
            success_metrics:
                '80% reduction in manual'
                + ' segmentation time, 25%'
                + ' increase in campaign'
                + ' conversion rates',
        },
        {
            id: 'cbTuSs0Ex84PeFGSvoAEFZ',
            title: 'Automated Report'
                + ' Generation',
            position: 2,
            problem_statement:
                'Analysts spend 15+ hours'
                + ' per week manually'
                + ' compiling reports from'
                + ' multiple data sources,'
                + ' causing delays in'
                + ' decision-making.',
            target_users:
                'Business analysts,'
                + ' finance team,'
                + ' department heads',
            proposed_solution:
                'Build an automated'
                + ' pipeline that aggregates'
                + ' data sources and'
                + ' generates formatted'
                + ' reports on a schedule.',
            expected_outcome:
                'Eliminate manual report'
                + ' assembly, freeing 15'
                + ' analyst-hours weekly and'
                + ' reducing report delivery'
                + ' time from days to'
                + ' minutes.',
            success_metrics:
                '90% reduction in report'
                + ' preparation time,'
                + ' 100% on-time delivery',
        },
        {
            id: 'wuCMQqo4IkEksx7MYmu8g2',
            title: 'Predictive Maintenance'
                + ' System',
            position: 3,
            problem_statement:
                'Unplanned equipment'
                + ' downtime costs $50K per'
                + ' incident and occurs 3-4'
                + ' times per quarter due to'
                + ' reactive maintenance.',
            target_users:
                'Operations team,'
                + ' maintenance crew,'
                + ' plant managers',
            proposed_solution:
                'Deploy IoT sensors with'
                + ' ML models to predict'
                + ' equipment failures 2-4'
                + ' weeks before they occur.',
            expected_outcome:
                'Reduce unplanned downtime'
                + ' by 70% and extend'
                + ' equipment lifespan by'
                + ' 20%, saving $150K'
                + ' annually.',
            success_metrics: '',
        },
        {
            id: 'ojOEXtdzdtTZtpM81TxVca',
            title: 'Real-time Analytics'
                + ' Dashboard',
            position: 4,
            problem_statement:
                'Leadership relies on'
                + ' weekly batch reports'
                + ' that are outdated by the'
                + ' time they arrive,'
                + ' missing real-time'
                + ' trends.',
            target_users:
                'Executive team,'
                + ' VP of operations,'
                + ' product managers',
            proposed_solution:
                'Create a live dashboard'
                + ' with streaming data'
                + ' pipelines, interactive'
                + ' filters, and automated'
                + ' anomaly alerts.',
            expected_outcome:
                'Enable real-time'
                + ' decision-making,'
                + ' reducing response time'
                + ' to market changes from'
                + ' 5 days to under 1 hour.',
            success_metrics:
                'Dashboard response time'
                + ' under 2 seconds, 95%'
                + ' daily active usage'
                + ' by leadership',
        },
        {
            id: 'T2vAafLDcshDONlYxpzPLc',
            title: 'Smart Inventory'
                + ' Optimization',
            position: 5,
            problem_statement:
                'Excess inventory ties up'
                + ' $2M in capital while'
                + ' stockouts cause 8% of'
                + ' orders to be delayed or'
                + ' cancelled.',
            target_users: '',
            proposed_solution:
                'Implement demand'
                + ' forecasting with'
                + ' automatic reorder'
                + ' triggers based on'
                + ' seasonality, trends, and'
                + ' lead times.',
            expected_outcome:
                'Reduce carrying costs by'
                + ' 30% and stockout'
                + ' incidents by 60%,'
                + ' improving customer'
                + ' satisfaction scores.',
            success_metrics: '',
        },
        {
            id: 'HRYrImq1rBJ5ZRe1T9TAVk',
            title: 'Employee Training'
                + ' Assistant',
            position: 6,
            problem_statement:
                'New hire onboarding takes'
                + ' 6 weeks on average, with'
                + ' inconsistent training'
                + ' quality across'
                + ' departments.',
            target_users:
                'New hires, HR team,'
                + ' department trainers',
            proposed_solution:
                'Build an AI training'
                + ' assistant that delivers'
                + ' personalized learning'
                + ' paths and answers'
                + ' procedural questions.',
            expected_outcome:
                'Reduce onboarding time to'
                + ' 3 weeks and improve new'
                + ' hire productivity scores'
                + ' by 40% in the first'
                + ' quarter.',
            success_metrics:
                '50% faster onboarding,'
                + ' 40% higher new-hire'
                + ' productivity scores',
        },
        {
            id: 'MCxK0hzT9CPjJx1ZV5unfr',
            title: 'AI-Powered Customer'
                + ' Support Chatbot',
            position: 8,
            problem_statement:
                'Support team handles'
                + ' 500+ tier-1 tickets'
                + ' daily, with average'
                + ' response time of 4'
                + ' hours.',
            target_users:
                'Customer support team,'
                + ' customers, support'
                + ' operations manager',
            proposed_solution:
                'Deploy an AI chatbot'
                + ' trained on historical'
                + ' tickets to resolve'
                + ' common inquiries'
                + ' instantly.',
            expected_outcome:
                'Deflect 60% of tier-1'
                + ' tickets and cut'
                + ' average response time'
                + ' to under 30 seconds.',
            success_metrics:
                '60% ticket deflection'
                + ' rate, CSAT above 4.5,'
                + ' average response time'
                + ' under 30 seconds',
        },
        {
            id: 'SUb4gKXsZ1OsEauzqszg0t',
            title: 'Mobile App Push'
                + ' Notification Revamp',
            position: 10,
            problem_statement:
                'Push notification opt-out'
                + ' rate is 42% due to'
                + ' irrelevant, poorly'
                + ' timed messages.',
            target_users:
                'Mobile app users,'
                + ' product team,'
                + ' marketing',
            proposed_solution:
                'Implement user-preference'
                + ' controls and ML-based'
                + ' send-time optimization.',
            expected_outcome:
                'Reduce opt-out rate to'
                + ' under 20% and increase'
                + ' notification engagement'
                + ' by 35%.',
            success_metrics:
                'Opt-out rate below 20%,'
                + ' 35% higher engagement'
                + ' on push notifications',
        },
        {
            id: 'gxa84W9KvEgD0wT1F4TOM9',
            title: 'Sustainability Dashboard'
                + ' for Operations',
            position: 9,
            problem_statement:
                'No centralized view of'
                + ' energy, water, and'
                + ' waste metrics across'
                + ' facilities.',
            target_users: '',
            proposed_solution:
                'Build a dashboard that'
                + ' aggregates utility data'
                + ' and tracks ESG goals'
                + ' in real time.',
            expected_outcome:
                'Achieve 15% reduction in'
                + ' energy costs and meet'
                + ' annual ESG reporting'
                + ' requirements.',
            success_metrics:
                '15% energy cost'
                + ' reduction, ESG report'
                + ' delivery on schedule',
        },
        {
            id: '1Z68gROMrlTAfPEGiyJJAY',
            title: 'Employee Wellness'
                + ' Program Integration',
            position: 11,
            problem_statement:
                'Employee burnout rates'
                + ' are rising with no'
                + ' unified wellness'
                + ' tracking or resources.',
            target_users:
                'All employees, HR team,'
                + ' people operations',
            proposed_solution:
                'Integrate wellness'
                + ' vendors into a single'
                + ' portal with usage'
                + ' analytics for HR.',
            expected_outcome:
                'Increase wellness'
                + ' program participation'
                + ' by 50% and reduce'
                + ' voluntary turnover'
                + ' by 12%.',
            success_metrics:
                '50% participation'
                + ' increase, 12% lower'
                + ' voluntary turnover',
        },
        {
            id: 'Q2On2xwMpFdzOklBQJXrni',
            title: 'Real-time Inventory'
                + ' Tracking System',
            position: 7,
            problem_statement:
                'Inventory counts rely on'
                + ' manual audits that lag'
                + ' 48 hours behind actual'
                + ' stock movements.',
            target_users:
                'Warehouse staff,'
                + ' supply chain team,'
                + ' logistics managers',
            proposed_solution:
                'Deploy barcode and RFID'
                + ' scanning with live'
                + ' sync to the warehouse'
                + ' management system.',
            expected_outcome:
                'Achieve 99.5% inventory'
                + ' accuracy and eliminate'
                + ' end-of-day manual'
                + ' reconciliation.',
            success_metrics:
                '99.5% inventory accuracy,'
                + ' zero manual'
                + ' reconciliation needed',
        },
    ];

    await Promise.all([
        ...ideas.map(idea =>
            adapter.ideas.put(idea.id, idea),
        ),
        adapter.organization.put({
            name: 'Stark Industries',
            domain: 'acmecorp.com',
            plan: 'Business',
            plan_status: 'active',
            next_billing: dt(-300, 0, 0),
            seats: 25,
            used_seats: 18,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
            health_score: 92,
            health_status: 'excellent',
            last_activity: dt(0, 16, 0),
        }),
    ]);

    const l2cProjectId =
        'L2cP01SalesPip3l1n3L01';

    const projects: ProjectEntity[] = [
        {
            id: 'u6YkHhlGc91oDMkr3x0isa',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            description:
                'Machine-learning model'
                + ' that segments customers'
                + ' in real time from'
                + ' behavior, purchase'
                + ' history, and engagement.',
            progress: 67,
            start_date: dt(60, 9, 0),
            target_end_date: dt(-30, 9, 0),
            estimated_cost: 88000,
            actual_cost: 51000,
            position: 1,
        },
        {
            id: 'jRE2Tj32NHsFGZIeEADp0p',
            title: 'Automated Report'
                + ' Generation',
            description:
                'Pipeline that aggregates'
                + ' multiple sources and'
                + ' ships formatted reports'
                + ' on a schedule.',
            progress: 100,
            start_date: dt(110, 9, 0),
            target_end_date: dt(45, 9, 0),
            estimated_cost: 56000,
            actual_cost: 58000,
            position: 2,
        },
        {
            id: l2cProjectId,
            title: 'Sales Pipeline'
                + ' Modernization',
            description:
                'Replace the legacy lead'
                + ' workflow with a triage-'
                + 'first pipeline:'
                + ' discovery, qualification,'
                + ' proposal, negotiation,'
                + ' close.',
            progress: 69,
            start_date: dt(55, 9, 0),
            target_end_date: dt(-25, 9, 0),
            estimated_cost: 78000,
            actual_cost: 48000,
            position: 3,
        },
        {
            id: 'P04PredMa1ntzyXY010203',
            title: 'Predictive Maintenance'
                + ' System',
            description:
                'IoT sensors plus ML'
                + ' models that predict'
                + ' equipment failures'
                + ' before they occur.',
            progress: 17,
            start_date: dt(18, 9, 0),
            target_end_date: dt(-90, 9, 0),
            estimated_cost: 110000,
            actual_cost: 7000,
            position: 4,
        },
        {
            id: 'P05RtAna1ytcsXY010203Z',
            title: 'Real-time Analytics'
                + ' Dashboard',
            description:
                'Live dashboard with'
                + ' streaming pipelines and'
                + ' automated anomaly alerts'
                + ' for leadership.',
            progress: 100,
            start_date: dt(95, 9, 0),
            target_end_date: dt(40, 9, 0),
            estimated_cost: 50000,
            actual_cost: 52000,
            position: 5,
        },
        {
            id: 'P06SmInvOptZyXY010203A',
            title: 'Smart Inventory'
                + ' Optimization',
            description:
                'Demand forecasting with'
                + ' automatic reorder'
                + ' triggers to cut carrying'
                + ' costs and stockouts.',
            progress: 76,
            start_date: dt(38, 9, 0),
            target_end_date: dt(-12, 9, 0),
            estimated_cost: 64000,
            actual_cost: 84000,
            position: 6,
        },
        {
            id: 'P07Empl0yTrainZyXY00B0',
            title: 'Employee Training'
                + ' Assistant',
            description:
                'AI training assistant'
                + ' that delivers'
                + ' personalized learning'
                + ' paths and answers'
                + ' procedural questions for'
                + ' new hires.',
            progress: 10,
            start_date: dt(12, 9, 0),
            target_end_date: dt(-110, 9, 0),
            estimated_cost: 60000,
            actual_cost: 3500,
            position: 7,
        },
        {
            id: 'P08CustSuppKn0wXY01C0D',
            title: 'Customer Support'
                + ' Knowledge Base',
            description:
                'Unified knowledge hub'
                + ' with AI-assisted search'
                + ' across tickets,'
                + ' runbooks, and product'
                + ' docs.',
            progress: 69,
            start_date: dt(48, 9, 0),
            target_end_date: dt(-22, 9, 0),
            estimated_cost: 64000,
            actual_cost: 42000,
            position: 8,
        },
        {
            id: 'P09C0mp1AudAut0mXY01E0',
            title: 'Compliance Audit'
                + ' Automation',
            description:
                'Auto-collect evidence,'
                + ' reconcile control'
                + ' mappings, and ship the'
                + ' annual SOC 2 dossier in'
                + ' hours rather than weeks.',
            progress: 86,
            start_date: dt(72, 9, 0),
            target_end_date: dt(-12, 9, 0),
            estimated_cost: 102000,
            actual_cost: 142000,
            position: 9,
        },
        {
            id: 'P10MlRgD1s4stRc1XY01FG',
            title: 'Multi-Region Disaster'
                + ' Recovery',
            description:
                'Active-active failover'
                + ' across two regions with'
                + ' five-minute RPO and'
                + ' fifteen-minute RTO.',
            progress: 91,
            start_date: dt(82, 9, 0),
            target_end_date: dt(-8, 9, 0),
            estimated_cost: 134000,
            actual_cost: 99000,
            position: 10,
        },
        {
            id: 'P11V0iceField0psXY01HJ',
            title: 'Voice-Driven Field'
                + ' Operations',
            description:
                'Hands-free voice agent'
                + ' for field techs: ticket'
                + ' updates, parts lookup,'
                + ' and onsite knowledge'
                + ' access.',
            progress: 53,
            start_date: dt(40, 9, 0),
            target_end_date: dt(-35, 9, 0),
            estimated_cost: 76000,
            actual_cost: 36000,
            position: 11,
        },
        {
            id: 'P12CarbF00tprXY01K0L0M',
            title: 'Carbon Footprint'
                + ' Tracking',
            description:
                'Ingest fleet, facility,'
                + ' and supplier emissions,'
                + ' then surface the live'
                + ' carbon ledger for ESG'
                + ' reporting.',
            progress: 100,
            start_date: dt(120, 9, 0),
            target_end_date: dt(35, 9, 0),
            estimated_cost: 62000,
            actual_cost: 56000,
            position: 12,
        },
        {
            id: 'P13W0rk4rcF0r3castsXY1',
            title: 'Workforce Capacity'
                + ' Forecasting',
            description:
                'Predict staffing demand'
                + ' by region and skill,'
                + ' then surface gaps eight'
                + ' weeks before they bite.',
            progress: 17,
            start_date: dt(22, 9, 0),
            target_end_date: dt(-105, 9, 0),
            estimated_cost: 90000,
            actual_cost: 8500,
            position: 13,
        },
        {
            id: 'P14SmartD0cumtR0utngX1',
            title: 'Smart Document Routing',
            description:
                'Classify and route'
                + ' inbound docs by content,'
                + ' urgency, and customer'
                + ' tier without a human'
                + ' bottleneck.',
            progress: 78,
            start_date: dt(65, 9, 0),
            target_end_date: dt(-18, 9, 0),
            estimated_cost: 70000,
            actual_cost: 45000,
            position: 14,
        },
        {
            id: 'P15Inv3st0rRep0rtP1Y00',
            title: 'Investor Reporting'
                + ' Portal',
            description:
                'Self-serve portal for'
                + ' LPs with quarterly'
                + ' statements, capital-call'
                + ' workflows, and'
                + ' audit-ready exports.',
            progress: 67,
            start_date: dt(58, 9, 0),
            target_end_date: dt(-28, 9, 0),
            estimated_cost: 56000,
            actual_cost: 34000,
            position: 15,
        },
    ];

    const wfTimestamp = dt(60, 9, 0);

    const l2cFlowId = 'L2cfL3adt0Cl0s3FzMxR02';
    const l2cProjectFlowId =
        'L2cPF01Pr0jL3adt0Cl001';

    const l2cCreateNodeId =
        'L2cN01Cr3atL3adClsXY02';
    const l2cTriageNodeId =
        'L2cN02Tr1agL3adClsAB03';
    const l2cDiscoveryNodeId =
        'L2cN03D1scvL3adClsCD04';
    const l2cQualifNodeId =
        'L2cN04Qu41fL3adClsEF05';
    const l2cProposalNodeId =
        'L2cN05Pr0psL3adClsGH06';
    const l2cNegotNodeId =
        'L2cN06N3g0tL3adClsIJ07';
    const l2cArchiveNodeId =
        'L2cN07Cl0sdL3adClsKL08';

    const l2cStartEdgeId =
        'L2cE01CreatTr1agL2cZ01';
    const l2cQualifyEdgeId =
        'L2cE02Tr1agD1scvL2cY02';
    const l2cDisqualifyEdgeId =
        'L2cE03Tr1agCl0sdL2cX03';
    const l2cPromisingEdgeId =
        'L2cE04D1scvQu41fL2cW04';
    const l2cGoEdgeId =
        'L2cE05Qu41fPr0psL2cV05';
    const l2cNeedsInfoEdgeId =
        'L2cE06Qu41fD1scvL2cU06';
    const l2cSubmitEdgeId =
        'L2cE07Pr0psN3g0tL2cT07';
    const l2cWonEdgeId =
        'L2cE08N3g0tCl0sdL2cS08';
    const l2cReviseEdgeId =
        'L2cE09N3g0tPr0psL2cR09';

    const workerSarah = 'LhfaUUf4IumVsCSGB4xjdK';
    const workerMarcus =
        'WxQn4LVWb76YkmqK5B0EPp';
    const workerMike = 'bLP3X1hb1mSz8gY9neogU3';
    const workerLisa = 'Trf1Up2jMsPhEnjbW4Ji1n';
    const workerClaude = 'LdoTR1fnyYpS1jPzEs57ek';

    const leadToCloseDescription =
        'Sales pipeline: triage, discovery,'
        + ' qualification, proposal,'
        + ' negotiation, close.';

    const leadToCloseNodes: GraphNode[] = [
        {
            id: l2cCreateNodeId,
            name: 'Create',
            description: '',
            positionX: 40,
            positionY: 30,
            isCreate: true,
            isArchive: false,
            workerIds: [],
            fields: [],
        },
        {
            id: l2cTriageNodeId,
            name: 'Inbound Triage',
            description: '',
            positionX: 220,
            positionY: 100,
            isCreate: false,
            isArchive: false,
            workerIds: [
                workerLisa, workerClaude,
            ],
            fields: [],
        },
        {
            id: l2cDiscoveryNodeId,
            name: 'Discovery Call',
            description: '',
            positionX: 400,
            positionY: 180,
            isCreate: false,
            isArchive: false,
            workerIds: [
                workerSarah, workerMarcus,
            ],
            fields: [],
        },
        {
            id: l2cQualifNodeId,
            name: 'Qualification',
            description: '',
            positionX: 580,
            positionY: 260,
            isCreate: false,
            isArchive: false,
            workerIds: [
                workerSarah, workerMarcus,
            ],
            fields: [],
        },
        {
            id: l2cProposalNodeId,
            name: 'Proposal Drafting',
            description: '',
            positionX: 760,
            positionY: 340,
            isCreate: false,
            isArchive: false,
            workerIds: [
                workerMike, workerSarah,
            ],
            fields: [],
        },
        {
            id: l2cNegotNodeId,
            name: 'Negotiation',
            description: '',
            positionX: 940,
            positionY: 420,
            isCreate: false,
            isArchive: false,
            workerIds: [workerSarah],
            fields: [],
        },
        {
            id: l2cArchiveNodeId,
            name: 'Archive',
            description: '',
            positionX: 1120,
            positionY: 500,
            isCreate: false,
            isArchive: true,
            workerIds: [],
            fields: [],
        },
    ];

    const leadToCloseEdges: GraphEdge[] = [
        {
            id: l2cStartEdgeId,
            name: 'start',
            description: '',
            fromNodeId: l2cCreateNodeId,
            toNodeId: l2cTriageNodeId,
        },
        {
            id: l2cQualifyEdgeId,
            name: 'qualify',
            description: '',
            fromNodeId: l2cTriageNodeId,
            toNodeId: l2cDiscoveryNodeId,
        },
        {
            id: l2cDisqualifyEdgeId,
            name: 'disqualify',
            description: '',
            fromNodeId: l2cTriageNodeId,
            toNodeId: l2cArchiveNodeId,
        },
        {
            id: l2cPromisingEdgeId,
            name: 'promising',
            description: '',
            fromNodeId: l2cDiscoveryNodeId,
            toNodeId: l2cQualifNodeId,
        },
        {
            id: l2cGoEdgeId,
            name: 'go',
            description: '',
            fromNodeId: l2cQualifNodeId,
            toNodeId: l2cProposalNodeId,
        },
        {
            id: l2cNeedsInfoEdgeId,
            name: 'needs info',
            description: '',
            fromNodeId: l2cQualifNodeId,
            toNodeId: l2cDiscoveryNodeId,
        },
        {
            id: l2cSubmitEdgeId,
            name: 'submit',
            description: '',
            fromNodeId: l2cProposalNodeId,
            toNodeId: l2cNegotNodeId,
        },
        {
            id: l2cWonEdgeId,
            name: 'won',
            description: '',
            fromNodeId: l2cNegotNodeId,
            toNodeId: l2cArchiveNodeId,
        },
        {
            id: l2cReviseEdgeId,
            name: 'revise terms',
            description: '',
            fromNodeId: l2cNegotNodeId,
            toNodeId: l2cProposalNodeId,
        },
    ];

    const mockFlows:
        FlowEntity[] = [
        {
            id: 'h5mErVBQhwdMKwi1co30jB',
            name: 'Customer Onboarding',
            description:
                'Standard customer'
                + ' onboarding process',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: 'lzkYvFNCEHARBQmZ4YHAn4',
                        name: 'Create',
                        description: '',
                        positionX: 40,
                        positionY: 30,
                        isCreate: true,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'KoWNvvHG8d3TLAVN5nrWGX',
                        name:
                            'Data Capture',
                        description: '',
                        positionX: 260,
                        positionY: 140,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [
                            'WxQn4LVWb76YkmqK5B0EPp',
                            'current',
                        ],
                        fields: [
                            {
                                id: '5JZ0LeKdPCa4QMtg1RsF1M',
                                name:
                                    'Company'
                                    + ' Name',
                                fieldType:
                                    'text',
                                sortOrder: 1,
                                isRequired:
                                    true,
                                options: [],
                            },
                            {
                                id: 'nplTIh0qXNtAyoWSwRaBYe',
                                name:
                                    'Contact'
                                    + ' Email',
                                fieldType:
                                    'email',
                                sortOrder: 2,
                                isRequired:
                                    true,
                                options: [],
                            },
                            {
                                id: 'kzHpMw9f1thq79VoBYeIX3',
                                name:
                                    'Contact'
                                    + ' Phone',
                                fieldType:
                                    'phone',
                                sortOrder: 3,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: 'QsmqiOmPtoMLGpSjHOqdHA',
                                name:
                                    'Industry',
                                fieldType:
                                    'select',
                                sortOrder: 4,
                                isRequired:
                                    false,
                                options: [
                                    'Technology',
                                    'Finance',
                                    'Healthcare',
                                    'Retail',
                                    'Manufacturing',
                                ],
                            },
                            {
                                id: '0TyjQRcygn3DIyXTe6x1F6',
                                name:
                                    'Annual'
                                    + ' Revenue',
                                fieldType:
                                    'currency',
                                sortOrder: 5,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: '8Z62tcRHBpwCRH1kBffx0G',
                                name:
                                    'Number of'
                                    + ' Employees',
                                fieldType:
                                    'number',
                                sortOrder: 6,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: 'mBrOOvQtZTTKb5TTnXvzXo',
                                name:
                                    'Company'
                                    + ' Logo',
                                fieldType:
                                    'image',
                                sortOrder: 7,
                                isRequired:
                                    false,
                                options: [],
                            },
                            {
                                id: 'y9DiJ5QHNB5ho3K1n9myMc',
                                name:
                                    'Supporting'
                                    + ' Documents',
                                fieldType:
                                    'file',
                                sortOrder: 8,
                                isRequired:
                                    false,
                                options: [],
                            },
                        ],
                    },
                    {
                        id: 'wDcQp0cIycrtWXEde6IsB1',
                        name: 'Review',
                        description: '',
                        positionX: 480,
                        positionY: 250,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [
                            {
                                id: 'AdQlKf43JV6yrhQbyskDkR',
                                name:
                                    'Reviewer'
                                    + ' Notes',
                                fieldType:
                                    'textarea',
                                sortOrder: 1,
                                isRequired:
                                    true,
                                options: [],
                            },
                        ],
                    },
                    {
                        id: '8jSnGiQ4Hedb2G75Y5aT7O',
                        name: 'Archive',
                        description: '',
                        positionX: 680,
                        positionY: 370,
                        isCreate: false,
                        isArchive: true,
                        workerIds: [],
                        fields: [],
                    },
                ],
                edges: [
                    {
                        id: 'QExPxoB0w8pQzQZYa0xuoI',
                        name: 'begin',
                        description: '',
                        fromNodeId:
                            'lzkYvFNCEHARBQmZ4YHAn4',
                        toNodeId:
                            'KoWNvvHG8d3TLAVN5nrWGX',
                    },
                    {
                        id: 'JOMWSa11urO1R4X2o7r6B9',
                        name: 'submit',
                        description: '',
                        fromNodeId:
                            'KoWNvvHG8d3TLAVN5nrWGX',
                        toNodeId:
                            'wDcQp0cIycrtWXEde6IsB1',
                    },
                    {
                        id: '7nRuNX7Hg9y6GFYWJrVBCH',
                        name:
                            'needs revision',
                        description: '',
                        fromNodeId:
                            'wDcQp0cIycrtWXEde6IsB1',
                        toNodeId:
                            'KoWNvvHG8d3TLAVN5nrWGX',
                    },
                    {
                        id: '3EET89t3L1FrCQe2kFJVl5',
                        name: 'approve',
                        description: '',
                        fromNodeId:
                            'wDcQp0cIycrtWXEde6IsB1',
                        toNodeId:
                            '8jSnGiQ4Hedb2G75Y5aT7O',
                    },
                ],
            }),
        },
        {
            id: 'E2BnBlZyrriqsQYkmS4usb',
            name: 'Fusion Flow',
            description: '',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: 'N8iGVHrr3iv0OCqICw2oWo',
                        name: 'Create',
                        description: '',
                        positionX: -702,
                        positionY: -236,
                        isCreate: true,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'nKbwVydJZixw20nvP2XqfF',
                        name: 'Archive',
                        description: '',
                        positionX: 436,
                        positionY: 358,
                        isCreate: false,
                        isArchive: true,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'aTGimTZZDvMb7iD9GuUbSG',
                        name: 'Ideas',
                        description: '',
                        positionX: -406,
                        positionY: -234,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '6KXcks9x9Tl54iNGWQoXNN',
                        name:
                            'Describe problem',
                        description: '',
                        positionX: -82,
                        positionY: -230,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'HmpBNWHjANtDY4qtKZENOE',
                        name: 'Who Benefits',
                        description: '',
                        positionX: 187,
                        positionY: -232,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'q1OZ85FQGwEbtIbFQo8H5o',
                        name: 'Solution',
                        description: '',
                        positionX: 527,
                        positionY: -231,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'Yt5GGbxJqVG5Ws4NrGWzDD',
                        name: 'Outcome',
                        description: '',
                        positionX: 525,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'm3sZ3Jk4ketOK9M9GD6qS1',
                        name: 'Edit Idea',
                        description: '',
                        positionX: 189,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'D5DUyVr3Azc8zfbqgMovTr',
                        name: 'Cost',
                        description: '',
                        positionX: -409,
                        positionY: 22,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '1TKczWqL7gndPvMGFxYWGI',
                        name: 'Impact',
                        description: '',
                        positionX: -411,
                        positionY: 141,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'Woly7CQBAkkGpe3A21lXoz',
                        name: 'Category',
                        description: '',
                        positionX: -143,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'DOj4MO3NnhgCDKllZnxDWT',
                        name: 'Time',
                        description: '',
                        positionX: -408,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'Liv4abswHyIMx4kJz6dTFo',
                        name: 'Idea',
                        description: '',
                        positionX: -412,
                        positionY: 278,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'yFZAcQT3sWkhyH0zB80nzH',
                        name: 'Idea',
                        description: '',
                        positionX: -140,
                        positionY: -3,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '9bPFthPRyPtvfXKti5Qtfo',
                        name:
                            'Review Queue',
                        description: '',
                        positionX: 188,
                        positionY: -7,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'bNGKd3eRcKynXWfJRLPlx1',
                        name:
                            'Approval Detail',
                        description: '',
                        positionX: 450,
                        positionY: 81,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'Bxkqmeb8izINPj8fmDFh0s',
                        name:
                            'Ideas approve',
                        description: '',
                        positionX: 143,
                        positionY: 274,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'IwXZhOjZKETjhF6g9OJmeQ',
                        name:
                            'Approval Detail',
                        description: '',
                        positionX: 448,
                        positionY: 214,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                ],
                edges: [
                    {
                        id: 'ZZScPB9Tsbybx2PZXhJjRi',
                        name: 'Create Idea',
                        description: '',
                        fromNodeId:
                            'N8iGVHrr3iv0OCqICw2oWo',
                        toNodeId:
                            'aTGimTZZDvMb7iD9GuUbSG',
                    },
                    {
                        id: '7XqroCtAynDGgi5Cm5VWae',
                        name:
                            'Create Title',
                        description: '',
                        fromNodeId:
                            'aTGimTZZDvMb7iD9GuUbSG',
                        toNodeId:
                            '6KXcks9x9Tl54iNGWQoXNN',
                    },
                    {
                        id: 'OB2L6yx8cOP91ulckc65md',
                        name: 'submit',
                        description: '',
                        fromNodeId:
                            '6KXcks9x9Tl54iNGWQoXNN',
                        toNodeId:
                            'HmpBNWHjANtDY4qtKZENOE',
                    },
                    {
                        id: 'bkx8cmU6yHT1YpjhTP3Rvm',
                        name:
                            'describe'
                            + ' solution',
                        description: '',
                        fromNodeId:
                            'HmpBNWHjANtDY4qtKZENOE',
                        toNodeId:
                            'q1OZ85FQGwEbtIbFQo8H5o',
                    },
                    {
                        id: 'RqvW7TTPDBfupjFFxdeznR',
                        name: 'Describe',
                        description: '',
                        fromNodeId:
                            'q1OZ85FQGwEbtIbFQo8H5o',
                        toNodeId:
                            'Yt5GGbxJqVG5Ws4NrGWzDD',
                    },
                    {
                        id: '4M5lJHKqGzId1jwsI14QZi',
                        name:
                            'Define'
                            + ' & Measure',
                        description: '',
                        fromNodeId:
                            'Yt5GGbxJqVG5Ws4NrGWzDD',
                        toNodeId:
                            'm3sZ3Jk4ketOK9M9GD6qS1',
                    },
                    {
                        id: 'UT7eoykdOetOZeCopKfefM',
                        name:
                            'Click on field',
                        description: '',
                        fromNodeId:
                            'm3sZ3Jk4ketOK9M9GD6qS1',
                        toNodeId:
                            'Woly7CQBAkkGpe3A21lXoz',
                    },
                    {
                        id: 'TTSKHNukJrKUYDvx5f1fsu',
                        name: 'Define',
                        description: '',
                        fromNodeId:
                            'Woly7CQBAkkGpe3A21lXoz',
                        toNodeId:
                            'DOj4MO3NnhgCDKllZnxDWT',
                    },
                    {
                        id: 'NmnbQwAHCgTmPKdWmI3Hfm',
                        name: 'Estimate',
                        description: '',
                        fromNodeId:
                            'DOj4MO3NnhgCDKllZnxDWT',
                        toNodeId:
                            'D5DUyVr3Azc8zfbqgMovTr',
                    },
                    {
                        id: 'K9anHKnA8oQnPxzcgocMmj',
                        name: 'Estimate',
                        description: '',
                        fromNodeId:
                            'D5DUyVr3Azc8zfbqgMovTr',
                        toNodeId:
                            '1TKczWqL7gndPvMGFxYWGI',
                    },
                    {
                        id: '9gfjcvJO0ZapJqovdeaKPX',
                        name: 'Estimate',
                        description: '',
                        fromNodeId:
                            '1TKczWqL7gndPvMGFxYWGI',
                        toNodeId:
                            'Liv4abswHyIMx4kJz6dTFo',
                    },
                    {
                        id: 'm3tfkY46Fa0pELrQ5h7IO2',
                        name: 'Submit',
                        description: '',
                        fromNodeId:
                            'Liv4abswHyIMx4kJz6dTFo',
                        toNodeId:
                            'yFZAcQT3sWkhyH0zB80nzH',
                    },
                    {
                        id: 'xHsuRI5N8KY0EFUVMPtSqo',
                        name: 'Review',
                        description: '',
                        fromNodeId:
                            'yFZAcQT3sWkhyH0zB80nzH',
                        toNodeId:
                            '9bPFthPRyPtvfXKti5Qtfo',
                    },
                    {
                        id: '483GMjR0CxRWqzmqeusZDi',
                        name: 'Select',
                        description: '',
                        fromNodeId:
                            '9bPFthPRyPtvfXKti5Qtfo',
                        toNodeId:
                            'bNGKd3eRcKynXWfJRLPlx1',
                    },
                    {
                        id: '1uOW9HWwpQ5UHz30pSE8sh',
                        name: 'Decline',
                        description: '',
                        fromNodeId:
                            'bNGKd3eRcKynXWfJRLPlx1',
                        toNodeId:
                            '9bPFthPRyPtvfXKti5Qtfo',
                    },
                    {
                        id: 'SOLWdDhsGPdfiYHzqIYneC',
                        name: 'Review',
                        description: '',
                        fromNodeId:
                            'bNGKd3eRcKynXWfJRLPlx1',
                        toNodeId:
                            'IwXZhOjZKETjhF6g9OJmeQ',
                    },
                    {
                        id: 'M9YyQWNFvu9mDWamXMvoRJ',
                        name: 'Approve',
                        description: '',
                        fromNodeId:
                            'IwXZhOjZKETjhF6g9OJmeQ',
                        toNodeId:
                            'Bxkqmeb8izINPj8fmDFh0s',
                    },
                    {
                        id: 'hniGGFLzDWLJDYi6Kvhbcz',
                        name: 'Released',
                        description: '',
                        fromNodeId:
                            'Bxkqmeb8izINPj8fmDFh0s',
                        toNodeId:
                            'nKbwVydJZixw20nvP2XqfF',
                    },
                ],
            }),
        },
        {
            id: '7COt7Kf4OaOBg6AjaNO04s',
            name:
                'Layout Test: Proposal Review Cycle',
            description:
                'Exercises multi-exit fans, nested'
                + ' decisions, convergence, and'
                + ' cycles for Auto Layout testing',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: 'qfuFbfKwwlpKAewu3Uujb7',
                        name: 'Create',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: true,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'M3HcytVGj8JNjrFS0AyVfA',
                        name: 'Draft',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'T6I6dn4MKD50QZXlvxIm9I',
                        name: 'Submit',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'OHPERFEO1EMfDoGZnccF5F',
                        name: 'Triage',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'NHIpcNdKKV4gbT4QOkkXEO',
                        name: 'Quick Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '4z9uXoChh9HjMTEHfZQhAk',
                        name: 'Standard Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'zO7tsd7ndwm2uQDwS30EzR',
                        name: 'Deep Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '32hICE8mCh9Ch0CMYyjEXR',
                        name: 'Panel A',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'WwjEFe4v1am6etJDQqg0mi',
                        name: 'Panel B',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'PU9ueWLOmK247RFNDwuh4R',
                        name: 'Panel C',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'ybr0XraIXnlbOhYRmBnkz6',
                        name: 'Panel D',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'qSJo6DFKY52Y0815TFax01',
                        name: 'Consolidate',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'rWdJ5vz4hm9dLVhBYROSoK',
                        name: 'Decision',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '4zi5yzNsiA89SzrcEityhr',
                        name: 'Approved',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '8yXx35sqhjAb3lfkSWbsG2',
                        name: 'Revise',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: 'HJBEhUvJ4rA9x8y3s2iVKZ',
                        name: 'Rejected',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        workerIds: [],
                        fields: [],
                    },
                    {
                        id: '9r0eSQ4ndyaRoYbKTTDpW2',
                        name: 'Archive',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: true,
                        workerIds: [],
                        fields: [],
                    },
                ],
                edges: [
                    {
                        id: 'd7PuQ9Zy29gFyzGPN4RpB3',
                        name: 'begin',
                        description: '',
                        fromNodeId:
                            'qfuFbfKwwlpKAewu3Uujb7',
                        toNodeId:
                            'M3HcytVGj8JNjrFS0AyVfA',
                    },
                    {
                        id: 'hsx6jDHfnhYjAyt38lhE55',
                        name: 'ready',
                        description: '',
                        fromNodeId:
                            'M3HcytVGj8JNjrFS0AyVfA',
                        toNodeId:
                            'T6I6dn4MKD50QZXlvxIm9I',
                    },
                    {
                        id: 'Ipx62MKIlQyFnGJ9QGYIFc',
                        name: 'submitted',
                        description: '',
                        fromNodeId:
                            'T6I6dn4MKD50QZXlvxIm9I',
                        toNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                    },
                    {
                        id: 'tdwLKK3AkUQ7ktWGtrtFvN',
                        name: 'quick',
                        description: '',
                        fromNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                        toNodeId:
                            'NHIpcNdKKV4gbT4QOkkXEO',
                    },
                    {
                        id: 'dD0IU0SRzeefvOwpCNralx',
                        name: 'standard',
                        description: '',
                        fromNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                        toNodeId:
                            '4z9uXoChh9HjMTEHfZQhAk',
                    },
                    {
                        id: 'GeTN4gJRAjQMT7I8SiIBWm',
                        name: 'deep',
                        description: '',
                        fromNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                        toNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                    },
                    {
                        id: 'fesMrzvcP7sjL4NukvoOgL',
                        name: 'panel A',
                        description: '',
                        fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            '32hICE8mCh9Ch0CMYyjEXR',
                    },
                    {
                        id: 'XbZxNKiFmWRM7958GGtzaQ',
                        name: 'panel B',
                        description: '',
                        fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            'WwjEFe4v1am6etJDQqg0mi',
                    },
                    {
                        id: 'VHwKGtKxu4SxHw7XeQa7QQ',
                        name: 'panel C',
                        description: '',
                        fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            'PU9ueWLOmK247RFNDwuh4R',
                    },
                    {
                        id: 'mHXz4czc4mmYXFDlAx6a6c',
                        name: 'panel D',
                        description: '',
                        fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            'ybr0XraIXnlbOhYRmBnkz6',
                    },
                    {
                        id: 'H3YmWhVQiXvOpkTGBGHZ3M',
                        name: 'A done',
                        description: '',
                        fromNodeId:
                            '32hICE8mCh9Ch0CMYyjEXR',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: '6mi4SitxXSt2cqN4Fi6j9i',
                        name: 'B done',
                        description: '',
                        fromNodeId:
                            'WwjEFe4v1am6etJDQqg0mi',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: 'vBNJ1EpY3GAnUli7yqgQuy',
                        name: 'C done',
                        description: '',
                        fromNodeId:
                            'PU9ueWLOmK247RFNDwuh4R',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: 'v5zoVkTe9K1YfBbPmYiFwY',
                        name: 'D done',
                        description: '',
                        fromNodeId:
                            'ybr0XraIXnlbOhYRmBnkz6',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: 'ycnonq2kyeYWBSyfbkJsw8',
                        name: 'to decision',
                        description: '',
                        fromNodeId:
                            'NHIpcNdKKV4gbT4QOkkXEO',
                        toNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                    },
                    {
                        id: 'uYtL09fL3FAXnH5zk5wb3g',
                        name: 'to decision',
                        description: '',
                        fromNodeId:
                            '4z9uXoChh9HjMTEHfZQhAk',
                        toNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                    },
                    {
                        id: 'R6kZDZixNfCpz0a3DfE8ti',
                        name: 'synthesized',
                        description: '',
                        fromNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                        toNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                    },
                    {
                        id: 'fUwITjW5uJkLFGZ4oPmVv0',
                        name: 'approve',
                        description: '',
                        fromNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                        toNodeId:
                            '4zi5yzNsiA89SzrcEityhr',
                    },
                    {
                        id: 'iEsz7rc6GfplC6wWzHJvK2',
                        name: 'revise',
                        description: '',
                        fromNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                        toNodeId:
                            '8yXx35sqhjAb3lfkSWbsG2',
                    },
                    {
                        id: '6iEoMDVIbOoniZ1bxgV3HA',
                        name: 'reject',
                        description: '',
                        fromNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                        toNodeId:
                            'HJBEhUvJ4rA9x8y3s2iVKZ',
                    },
                    {
                        id: 'rrAD5jbsCqKxnrJXkROXKr',
                        name: 'done',
                        description: '',
                        fromNodeId:
                            '4zi5yzNsiA89SzrcEityhr',
                        toNodeId:
                            '9r0eSQ4ndyaRoYbKTTDpW2',
                    },
                    {
                        id: 'gS7JmZcHknZ06T41zSTtYt',
                        name: 'done',
                        description: '',
                        fromNodeId:
                            'HJBEhUvJ4rA9x8y3s2iVKZ',
                        toNodeId:
                            '9r0eSQ4ndyaRoYbKTTDpW2',
                    },
                    {
                        id: 'sfrAXlOXTtoqUuNQCwTbet',
                        name: 'back to draft',
                        description: '',
                        fromNodeId:
                            '8yXx35sqhjAb3lfkSWbsG2',
                        toNodeId:
                            'M3HcytVGj8JNjrFS0AyVfA',
                    },
                ],
            }),
        },
        {
            id: l2cFlowId,
            name: 'Lead-to-Close',
            description:
                leadToCloseDescription,
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: leadToCloseNodes,
                edges: leadToCloseEdges,
            }),
        },
    ];

    const woId =
        'wg25b0R2gwy5kYPIhQB6cS';
    const woFlowGraph =
        mockFlows[0]!.graph;
    const woCreated = dt(14, 10, 0);
    const woNodeNew =
        'lzkYvFNCEHARBQmZ4YHAn4';
    const woNodeCapture =
        'KoWNvvHG8d3TLAVN5nrWGX';
    const woNodeReview =
        'wDcQp0cIycrtWXEde6IsB1';
    const woNodeComplete =
        '8jSnGiQ4Hedb2G75Y5aT7O';
    const woPersonSarah =
        'LhfaUUf4IumVsCSGB4xjdK';
    const woPersonMike =
        'bLP3X1hb1mSz8gY9neogU3';
    // Data Capture node workers: Marcus and the
    // current user (the in-clan workers)
    const woPersonMarcus =
        'WxQn4LVWb76YkmqK5B0EPp';
    const woPersonCurrent = 'current';
    // Parsed once so every seeded WO snapshot
    // matches the live flow_graph shape without
    // 36 redundant JSON.parse calls.
    const woGraphParsed = JSON.parse(
        woFlowGraph,
    ) as { nodes: unknown; edges: unknown };
    function woGraph(): JsonObjectField {
        return jsonObjectField({
            flowId:
                'h5mErVBQhwdMKwi1co30jB',
            name:
                'Customer Onboarding',
            description:
                'Standard customer'
                + ' onboarding'
                + ' process',
            lockTimeout:
                DEFAULT_LOCK_TIMEOUT,
            nodes: woGraphParsed.nodes,
            edges: woGraphParsed.edges,
        });
    }

    // Parsed once so all prc WO snapshots
    // match the live flow_graph shape.
    const prcFlowGraph =
        mockFlows[2]!.graph;
    const prcGraphParsed = JSON.parse(
        prcFlowGraph,
    ) as { nodes: unknown; edges: unknown };
    function prcGraph(): JsonObjectField {
        return jsonObjectField({
            flowId:
                '7COt7Kf4OaOBg6AjaNO04s',
            name:
                'Layout Test: Proposal'
                + ' Review Cycle',
            description:
                'Exercises multi-exit'
                + ' fans, nested'
                + ' decisions,'
                + ' convergence, and'
                + ' cycles for Auto'
                + ' Layout testing',
            lockTimeout:
                DEFAULT_LOCK_TIMEOUT,
            nodes: prcGraphParsed.nodes,
            edges: prcGraphParsed.edges,
        });
    }

    // prc node id constants
    const prcNodeStart =
        'qfuFbfKwwlpKAewu3Uujb7';
    const prcNodeDraft =
        'M3HcytVGj8JNjrFS0AyVfA';
    const prcNodeSubmit =
        'T6I6dn4MKD50QZXlvxIm9I';
    const prcNodeTriage =
        'OHPERFEO1EMfDoGZnccF5F';
    const prcNodeQuickRev =
        'NHIpcNdKKV4gbT4QOkkXEO';
    const prcNodeDecision =
        'rWdJ5vz4hm9dLVhBYROSoK';
    const prcNodeApproved =
        '4zi5yzNsiA89SzrcEityhr';
    const prcNodeRevise =
        '8yXx35sqhjAb3lfkSWbsG2';
    const prcNodeArchive =
        '9r0eSQ4ndyaRoYbKTTDpW2';

    const fCompanyName =
        '5JZ0LeKdPCa4QMtg1RsF1M';
    const fEmail =
        'nplTIh0qXNtAyoWSwRaBYe';
    const fPhone =
        'kzHpMw9f1thq79VoBYeIX3';
    const fIndustry =
        'QsmqiOmPtoMLGpSjHOqdHA';
    const fRevenue =
        '0TyjQRcygn3DIyXTe6x1F6';
    const fEmployees =
        '8Z62tcRHBpwCRH1kBffx0G';
    const fReviewerNotes =
        'AdQlKf43JV6yrhQbyskDkR';

    const mockWorkOrders:
        WorkOrderEntity[] = [
        {
            id: woId,
            display_id: 'a7c3e1f9',
            flow_graph: jsonObjectField({
                flowId:
                    'h5mErVBQhwdMKwi1co30jB',
                name:
                    'Customer Onboarding',
                description:
                    'Standard customer'
                    + ' onboarding'
                    + ' process',
                lockTimeout:
                    DEFAULT_LOCK_TIMEOUT,
                nodes: JSON.parse(
                    woFlowGraph,
                ).nodes,
                edges: JSON.parse(
                    woFlowGraph,
                ).edges,
            }),
            position: 1,
        },
        // ── happy-path runs (WO02-WO23) ──────────
        // Create → Data Capture → Review → Archive.
        // Sojourn in Data Capture varies 1–9 days
        // with a fat right tail so Data Capture is
        // the hot node in heat stats.
        {
            id: 'kKtX2W0iVTWFPEoPrJmIHW',
            display_id: 'b2d4f6a8',
            flow_graph: woGraph(),
            position: 2,
        },
        {
            id: 'taUp8y0cuMhzf0UOk6Ev8Y',
            display_id: 'c3e5g7b9',
            flow_graph: woGraph(),
            position: 3,
        },
        {
            id: 'KD2WFTEwzJFvxZ6cpCwpvc',
            display_id: 'd4f6h8c0',
            flow_graph: woGraph(),
            position: 4,
        },
        {
            id: 'b6YNHrFyi6V9dJNXyCXu1K',
            display_id: 'e5g7i9d1',
            flow_graph: woGraph(),
            position: 5,
        },
        {
            id: 'V3AXXlSjJwDQAmkNiRA8aP',
            display_id: 'f6h8j0e2',
            flow_graph: woGraph(),
            position: 6,
        },
        {
            id: '9ooK5olzSsEnpgP8ASzBQi',
            display_id: 'g7i9k1f3',
            flow_graph: woGraph(),
            position: 7,
        },
        {
            id: 'cnXN4DZx9dUVIZL4OZnyw0',
            display_id: 'h8j0l2g4',
            flow_graph: woGraph(),
            position: 8,
        },
        {
            id: 'kKw82RQDHRfgg5xQnw1lPk',
            display_id: 'i9k1m3h5',
            flow_graph: woGraph(),
            position: 9,
        },
        {
            id: 'ec0n7Ab6pJYLFDF6H0nyvV',
            display_id: 'j0l2n4i6',
            flow_graph: woGraph(),
            position: 10,
        },
        {
            id: 'gAjJnjirIrIgcFDMJyNsPa',
            display_id: 'k1m3o5j7',
            flow_graph: woGraph(),
            position: 11,
        },
        {
            id: 'kyWtMAZPazKqAfIwPzACsL',
            display_id: 'l2n4p6k8',
            flow_graph: woGraph(),
            position: 12,
        },
        {
            id: 'C41Hni5pMxp8xMQFEGNaib',
            display_id: 'm3o5q7l9',
            flow_graph: woGraph(),
            position: 13,
        },
        {
            id: 'FGAZYYwoS9To1tNb24DfLc',
            display_id: 'n4p6r8m0',
            flow_graph: woGraph(),
            position: 14,
        },
        {
            id: '0zgLwuyPgtreVYjg4TScJR',
            display_id: 'o5q7s9n1',
            flow_graph: woGraph(),
            position: 15,
        },
        {
            id: 'XGJklKFO4aUtjSAEHEE8Zn',
            display_id: 'p6r8t0o2',
            flow_graph: woGraph(),
            position: 16,
        },
        {
            id: 'rtuFD9uWn5zguEHyT3fh8s',
            display_id: 'q7s9u1p3',
            flow_graph: woGraph(),
            position: 17,
        },
        {
            id: 'XrO05MeyqldO8qm0O4VPdq',
            display_id: 'r8t0v2q4',
            flow_graph: woGraph(),
            position: 18,
        },
        {
            id: 'S74N7CPA2dsMESryJNrFAC',
            display_id: 's9u1w3r5',
            flow_graph: woGraph(),
            position: 19,
        },
        {
            id: 'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            display_id: 't0v2x4s6',
            flow_graph: woGraph(),
            position: 20,
        },
        {
            id: '4T56gYme7ae4Ya7AMA0hpW',
            display_id: 'u1w3y5t7',
            flow_graph: woGraph(),
            position: 21,
        },
        {
            id: 'aFCyJrvokoJM5iINwO3WCf',
            display_id: 'v2x4z6u8',
            flow_graph: woGraph(),
            position: 22,
        },
        {
            id: 'Sr4k75y6vuKODCA9zlSUjk',
            display_id: 'w3y5a7v9',
            flow_graph: woGraph(),
            position: 23,
        },
        // ── needs-revision loops (WO24-WO29) ─────
        // … → Data Capture → Review → Data Capture
        // → Review → Archive. Exercises revisit
        // rate and the Review→Capture branch split.
        {
            id: 'Mm6KUpykGSwjD7YofI6zpb',
            display_id: 'x4z6b8w0',
            flow_graph: woGraph(),
            position: 24,
        },
        {
            id: 'BbZ3Z7OZnFmdF5MBgVIYzI',
            display_id: 'y5a7c9x1',
            flow_graph: woGraph(),
            position: 25,
        },
        {
            id: 'NydsTqMmCgEKI7R9xxp36g',
            display_id: 'z6b8d0y2',
            flow_graph: woGraph(),
            position: 26,
        },
        {
            id: 'x2uQev3HutthrUWRFkXSkH',
            display_id: 'a7c9e1z3',
            flow_graph: woGraph(),
            position: 27,
        },
        {
            id: 'w7XA9UnuYI7e46RTQL1xGW',
            display_id: 'b8d0f2a4',
            flow_graph: woGraph(),
            position: 28,
        },
        {
            id: '3H3XeeNE4rS2wbANs3JvYz',
            display_id: 'c9e1g3b5',
            flow_graph: woGraph(),
            position: 29,
        },
        // in-flight runs (WO30-WO34):
        // Last transition lands in Data Capture or
        // Review with no Archive; exercises WIP and
        // incompleteWorkOrderCount.
        {
            id: 'i7YYgKN3ZUlrkulQ2aWdIE',
            display_id: 'd0f2h4c6',
            flow_graph: woGraph(),
            position: 30,
        },
        {
            id: '0brjvcoPEVBwMkUQ3tKHWc',
            display_id: 'e1g3i5d7',
            flow_graph: woGraph(),
            position: 31,
        },
        {
            id: 'mTdhglHhl7pM0mKt0M2IjF',
            display_id: 'f2h4j6e8',
            flow_graph: woGraph(),
            position: 32,
        },
        {
            id: 'GMhfH8lMQJXzE4vkjnSH1u',
            display_id: 'g3i5k7f9',
            flow_graph: woGraph(),
            position: 33,
        },
        {
            id: 'pLxCFGOINXVaXmrS0VG0vC',
            display_id: 'h4j6l8g0',
            flow_graph: woGraph(),
            position: 34,
        },
        // ── out-of-clan runs (WO35-WO36) ─────────
        // OUT-transition from Data Capture is by
        // Sarah or Mike — neither is among that
        // node's workers, so topProducer.inCurrentClan
        // is false.
        {
            id: 'IyrpZrIl2hbmmnCtiifEGm',
            display_id: 'i5k7m9h1',
            flow_graph: woGraph(),
            position: 35,
        },
        {
            id: 'zYnDWBV4VP5guzW5fDWtHN',
            display_id: 'j6l8n0i2',
            flow_graph: woGraph(),
            position: 36,
        },
        // old runs (WO37-WO38):
        // Created ~105 days ago, outside the
        // trailing-90-day stats window — so heat
        // values for their node visits are clipped.
        {
            id: '7HX7RPwlYopHWfD7I0QAPs',
            display_id: 'k7m9o1j3',
            flow_graph: woGraph(),
            position: 37,
        },
        {
            id: 'EXphSopBU1Is2TH4QZo4nO',
            display_id: 'l8n0p2k4',
            flow_graph: woGraph(),
            position: 38,
        },
        // Proposal Review Cycle (prc01-prc06):
        // second flow demo -- 4 happy-path, 1
        // revisit, 1 in-flight.
        {
            id: 'hRPNkjrYBTQqzzFe1t8FH6',
            display_id: '5tb2nOoHyhRpy3UHlyrJKl',
            flow_graph: prcGraph(),
            position: 39,
        },
        {
            id: 'L3UhOvrAGluk4kNnN6J8NT',
            display_id: 'ZifylnGqzY8uXQ30d1DgeP',
            flow_graph: prcGraph(),
            position: 40,
        },
        {
            id: 'oTscblsEOjZDkvkW3vs7rU',
            display_id: 'IoF2qGX8bftkrW4QrLnBwp',
            flow_graph: prcGraph(),
            position: 41,
        },
        {
            id: 'Xpw9VGpZ6RyevuInSr8yze',
            display_id: '3eC66vpxib66qPnv7hdxvJ',
            flow_graph: prcGraph(),
            position: 42,
        },
        // prc05: revisit -- Decision sends back
        // to Revise then Draft before completing.
        {
            id: 'yqPpJb0NoQDgx8DoZ183Nx',
            display_id: 'tmj4YM3W8H1qgr4sUIpY35',
            flow_graph: prcGraph(),
            position: 43,
        },
        // prc06: in-flight -- stuck at Decision.
        {
            id: 'BUrGEVDMF6FeU35WUHUY5E',
            display_id: 'Tb52zOWUVGcaSQRFSLDXPV',
            flow_graph: prcGraph(),
            position: 44,
        },
    ];

    const mockFlowWorkOrders:
        FlowWorkOrderEntity[] = [
        {
            id: 'Cc7LblYXfmmZpg8DLZmhVw',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id: woId,
            at: woCreated,
        },
        // happy-path
        {
            id: 'l1QwKaS2EYCT8nJCAFXXN0',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            at: dt(88, 9, 0),
        },
        {
            id: 'FjjhKDthEYLf50lmPrKkaq',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            at: dt(82, 10, 0),
        },
        {
            id: 'vNj3XdrWhDpoFW8qsLsqKg',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            at: dt(76, 8, 30),
        },
        {
            id: 'hjPgB0KYD5Sesnjejnohf6',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            at: dt(71, 9, 0),
        },
        {
            id: 'UhSuMtC66uclQH5irfsqd0',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            at: dt(66, 11, 0),
        },
        {
            id: 'J0GfRrP7J5tNhBDCXDDOPV',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            at: dt(61, 9, 30),
        },
        {
            id: 'nULvK3MsVfud7QkAlrNGpQ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            at: dt(57, 8, 0),
        },
        {
            id: 'NUnAiiPpzpQ9wKx6utsGwn',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            at: dt(52, 10, 0),
        },
        {
            id: 'tuqFkKJMD4baNSMgXFWIh3',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            at: dt(48, 9, 0),
        },
        {
            id: 'G1IeM0YcxnPVe8ZuYnJ9oJ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            at: dt(44, 10, 30),
        },
        {
            id: '5Ctl6blp1xESHHiQtp0hUU',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'kyWtMAZPazKqAfIwPzACsL',
            at: dt(40, 9, 0),
        },
        {
            id: 'tlNTceD8uVvWlIjXDH0ayW',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'C41Hni5pMxp8xMQFEGNaib',
            at: dt(37, 8, 0),
        },
        {
            id: 'RUF1gVmAhswD070VXbltZj',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'FGAZYYwoS9To1tNb24DfLc',
            at: dt(33, 9, 30),
        },
        {
            id: 's8LTGragbMejtSAdAVF1u3',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '0zgLwuyPgtreVYjg4TScJR',
            at: dt(29, 10, 0),
        },
        {
            id: 'IAEG9nJXxCFzya2R3z9Rzy',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            at: dt(26, 9, 0),
        },
        {
            id: 'c1BsfY0187lX0bv9IMRin6',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            at: dt(23, 8, 30),
        },
        {
            id: 'HdDAafhVYetmEDZI57F2o9',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'XrO05MeyqldO8qm0O4VPdq',
            at: dt(20, 10, 0),
        },
        {
            id: 'yFhQ6jemy8OUls9GCH9sJq',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'S74N7CPA2dsMESryJNrFAC',
            at: dt(17, 9, 0),
        },
        {
            id: 'C7ASzGoDhS3c9Er43SznuQ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            at: dt(14, 8, 0),
        },
        {
            id: 'gj9UFVp6N0LY43tiZO7kEH',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            at: dt(11, 10, 30),
        },
        {
            id: 'QXnnDlwCXKN12k4oUPse4B',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'aFCyJrvokoJM5iINwO3WCf',
            at: dt(9, 9, 0),
        },
        {
            id: 'hyC8PMVNYng3UIO93yexAR',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            at: dt(6, 11, 0),
        },
        // needs-revision
        {
            id: '9lPGvmt7DdS6Uy7RuOYCxZ',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            at: dt(77, 9, 0),
        },
        {
            id: 'w9t0kM5OR9xNz8Qd8YMvWd',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            at: dt(63, 10, 0),
        },
        {
            id: 'OynJa34EkAifV6XvROGJHO',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'NydsTqMmCgEKI7R9xxp36g',
            at: dt(50, 8, 30),
        },
        {
            id: 'hFaKVhqcwwCtiDmjHOhglF',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'x2uQev3HutthrUWRFkXSkH',
            at: dt(38, 9, 0),
        },
        {
            id: 'lJalI8qDpdF8zng1mr7dkW',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            at: dt(25, 10, 0),
        },
        {
            id: 'UFSLHfELrPhlOvdaQv8yrC',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            at: dt(12, 9, 30),
        },
        // in-flight
        {
            id: 'U0vPeW2wXXSwUQ1IWSxa2O',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'i7YYgKN3ZUlrkulQ2aWdIE',
            at: dt(18, 9, 0),
        },
        {
            id: 'uhMESfwESpe11vhqKvQ2kB',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '0brjvcoPEVBwMkUQ3tKHWc',
            at: dt(10, 10, 0),
        },
        {
            id: 'ZNrxNuiqHTULou4TqYPtXL',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'mTdhglHhl7pM0mKt0M2IjF',
            at: dt(7, 8, 0),
        },
        {
            id: '5AsLDAhvbkXZ6OUvvoZhND',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            at: dt(4, 9, 0),
        },
        {
            id: 'avduZh1Hyokc9xiUjDQA0F',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            at: dt(2, 11, 0),
        },
        // out-of-clan
        {
            id: 'XeHGIWNzurFqBqHkQqV6El',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            at: dt(35, 9, 0),
        },
        {
            id: 'jxMN634ymWUYVZQK5on62x',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            at: dt(22, 10, 30),
        },
        // old (outside 90-day window)
        {
            id: 'ChEQk8m36NL0ADf6Nfez5f',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            at: dt(108, 9, 0),
        },
        {
            id: 'nycbBiutlHj1MUnI02Pw20',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'EXphSopBU1Is2TH4QZo4nO',
            at: dt(103, 10, 0),
        },
        // prc join rows (Proposal Review Cycle)
        {
            id: '1MMz7BIQ0qgacH3CCUafKk',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            at: dt(60, 9, 0),
        },
        {
            id: 'UXIU5zCYBFkQnMnChd1Q6T',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            at: dt(45, 10, 0),
        },
        {
            id: 'jQUWpOW1y7QcYSS49Cy3dE',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'oTscblsEOjZDkvkW3vs7rU',
            at: dt(30, 8, 0),
        },
        {
            id: 'y9Aba8YosD7VcSMV2Ncwoc',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            at: dt(20, 11, 0),
        },
        {
            id: 'RKSovIx9Jb03ZHsLWpI1EC',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            at: dt(15, 9, 0),
        },
        {
            id: 'XAQNINxgYd6Ngjv06NztQh',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            at: dt(5, 10, 0),
        },
    ];

    const mockStateEvents:
        StateEntity[] = [
        {
            id: '9nP0K7FVlCFps3eqMnbnMU',
            entity_id: woId,
            state: woNodeNew,
            worker_id: woPersonSarah,
            at:
                woCreated,
        },
        {
            id: 'MbiHcJxVA5Tde3oBh3Ka8p',
            entity_id: woId,
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at:
                woCreated,
        },
        {
            id: 'eJEybxfXaf3sjwFilZnunU',
            entity_id: woId,
            state: woNodeReview,
            worker_id: woPersonMike,
            at:
                dt(13, 14, 30),
        },
        {
            id: 'C2xb2bbjyHD11WfLayh8Om',
            entity_id: woId,
            state:
                woNodeComplete,
            worker_id: woPersonSarah,
            at:
                dt(12, 9, 15),
        },
        // happy-path WO02: DC sojourn 1 day
        {
            id: '6eT1jG5MoR9A5PvRvgCUBq',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(88, 9, 0),
        },
        {
            id: 'MEsinaVfIifb90ByaJBjrp',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(88, 9, 5),
        },
        {
            id: 'xI5NDQXN8Ns5oe0XeEPX2o',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(87, 10, 0),
        },
        {
            id: 'k4yValdb0nLdwsZdgvuwtq',
            entity_id:
                'kKtX2W0iVTWFPEoPrJmIHW',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(85, 14, 0),
        },
        // happy-path WO03: DC sojourn 2 days
        {
            id: 'rAnt2MH37Zm1uvaDdJQIU7',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(82, 10, 0),
        },
        {
            id: 'VwD21aMsYlSZ91oOeKoQv3',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(82, 10, 8),
        },
        {
            id: 'lntXIDCTtC6uXtkanv5XYm',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(80, 11, 0),
        },
        {
            id: 'oSOuQpIKaTo9TU70OtfU8P',
            entity_id:
                'taUp8y0cuMhzf0UOk6Ev8Y',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(79, 9, 0),
        },
        // happy-path WO04: DC sojourn 3 days
        {
            id: 'ggJA4BZvTpqxEPkgbiNnyt',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(76, 8, 30),
        },
        {
            id: 'LzLQkGqfrjFNaQIQNVp2yt',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(76, 8, 40),
        },
        {
            id: 'ZpwjIdExxdeZP7m5YDH5Qt',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(73, 10, 0),
        },
        {
            id: 'ZdoF8Ka2fa6xFFdzWi3odO',
            entity_id:
                'KD2WFTEwzJFvxZ6cpCwpvc',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(71, 15, 0),
        },
        // happy-path WO05: DC sojourn 1 day
        {
            id: 'IJKj026ouhbUQv7w4y7V7o',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(71, 9, 0),
        },
        {
            id: 'g4q1KxVqvyS8ZxOIDnu4MG',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(71, 9, 10),
        },
        {
            id: '6kwY7EJsL4khehGbJmS9YV',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(70, 14, 0),
        },
        {
            id: 'zK2ywEqCxPE75HKfGdGtEY',
            entity_id:
                'b6YNHrFyi6V9dJNXyCXu1K',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(68, 10, 0),
        },
        // happy-path WO06: DC sojourn 5 days
        {
            id: '3lD2Yf5csm1zBR9vdGnnh2',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(66, 11, 0),
        },
        {
            id: 'Kqw1IND5JwmUemrbWDKSg1',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(66, 11, 12),
        },
        {
            id: '8fuCWUtGDYOCBszoGuYhNZ',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(61, 9, 0),
        },
        {
            id: 'vqxo8lToEgDdEItcJg8GMI',
            entity_id:
                'V3AXXlSjJwDQAmkNiRA8aP',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(59, 14, 0),
        },
        // happy-path WO07: DC sojourn 2 days
        {
            id: 'DkCRDYtzbHbaGZY45hrIrB',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(61, 9, 30),
        },
        {
            id: 'g7Fnaud4XIGM4bceFOFtim',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(61, 9, 45),
        },
        {
            id: 'gdnClJs1LLxrx2fvZ3vQQ4',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(59, 11, 0),
        },
        {
            id: 'WT4tD5XUmDdh40hI5Ny17B',
            entity_id:
                '9ooK5olzSsEnpgP8ASzBQi',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(58, 9, 0),
        },
        // happy-path WO08: DC sojourn 4 days
        {
            id: 'hKpS4YMC7r7PivyHgc2Swa',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(57, 8, 0),
        },
        {
            id: 'hhTvFksUIDQyQA401xmNXg',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(57, 8, 15),
        },
        {
            id: 'mAOQLPzk3Ud64ndZnbjMPB',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(53, 10, 0),
        },
        {
            id: 'qMAn5oFts3CEnMsqbNYPA8',
            entity_id:
                'cnXN4DZx9dUVIZL4OZnyw0',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(51, 14, 0),
        },
        // happy-path WO09: DC sojourn 7 days (fat tail)
        {
            id: 'KcxCc7AQLnNZddDwJ8YMOu',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(52, 10, 0),
        },
        {
            id: 'HM3YTTlopkJetDhpXglt3l',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(52, 10, 20),
        },
        {
            id: 'ZXc0n8qwamt9gjeXFZYPYQ',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(45, 9, 0),
        },
        {
            id: 'h4s2ZGnlkiHKTB41nfKXzR',
            entity_id:
                'kKw82RQDHRfgg5xQnw1lPk',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(43, 11, 0),
        },
        // happy-path WO10: DC sojourn 3 days
        {
            id: 'i13zOn0NJF0wZANpm9qtz8',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(48, 9, 0),
        },
        {
            id: 'hSuu3PNyZ6vzzQRse3MT2y',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(48, 9, 10),
        },
        {
            id: 'f78pCgCBuvzSIHNSiksOY3',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(45, 14, 0),
        },
        {
            id: 'FHTXZEVfwmd8eXb3Kc4iyn',
            entity_id:
                'ec0n7Ab6pJYLFDF6H0nyvV',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(43, 10, 0),
        },
        // happy-path WO11: DC sojourn 2 days
        {
            id: '4tXtqSAncDHgMSfj292vLB',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(44, 10, 30),
        },
        {
            id: 'EuTRGmhwi9ZKpu4bICyIAA',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(44, 10, 45),
        },
        {
            id: 'SShq2HjeSjOa2tDzITkJHj',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(42, 11, 0),
        },
        {
            id: 'CgSA6m6TcjUwqAgugKt4U2',
            entity_id:
                'gAjJnjirIrIgcFDMJyNsPa',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(41, 14, 0),
        },
        // happy-path WO12: DC sojourn 6 days (fat tail)
        {
            id: 'YIZ38Dgl4BXjhVyOlXnevi',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(40, 9, 0),
        },
        {
            id: 'lx7EAKYYTwDEsOA0CTRXbz',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(40, 9, 15),
        },
        {
            id: '47p7RbBeyj6gq7UoglbTLQ',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(34, 10, 0),
        },
        {
            id: 'TMBYhhOKzYesHHiHsNXfMH',
            entity_id:
                'kyWtMAZPazKqAfIwPzACsL',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(32, 9, 0),
        },
        // happy-path WO13: DC sojourn 1 day
        {
            id: 'VZsA9htg9Km4qLsfhRGETg',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(37, 8, 0),
        },
        {
            id: 'Er9sQyVEvd6rSbmH2tC6zc',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(37, 8, 10),
        },
        {
            id: 'QGs5QdbV9ANQf2reuiemRd',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(36, 11, 0),
        },
        {
            id: 'nx5ooiuS68Mvj63uuuFpQN',
            entity_id:
                'C41Hni5pMxp8xMQFEGNaib',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(35, 14, 0),
        },
        // happy-path WO14: DC sojourn 9 days (fat tail)
        {
            id: 'f2v27lmnpRGtYQxQ9omyeZ',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(33, 9, 30),
        },
        {
            id: 'GIJUAabpi1KGevTrAzXirD',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(33, 9, 45),
        },
        {
            id: '6r9REsvwOdW8DqriF2g76f',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(24, 10, 0),
        },
        {
            id: 'Q56P9URSLJfpKaSMBejDla',
            entity_id:
                'FGAZYYwoS9To1tNb24DfLc',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(22, 9, 0),
        },
        // happy-path WO15: DC sojourn 2 days
        {
            id: '7Qg7wrpNWmoTHlSPoXJrMm',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(29, 10, 0),
        },
        {
            id: 'TFj780SI0g7CP9d1nO1mjy',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(29, 10, 15),
        },
        {
            id: 'Ly9CvZo9IA5JS77ETKKtRj',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(27, 14, 0),
        },
        {
            id: 'aWPQp3IBWqWnaqr45BhMba',
            entity_id:
                '0zgLwuyPgtreVYjg4TScJR',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(25, 10, 0),
        },
        // happy-path WO16: DC sojourn 3 days
        {
            id: 'BKqz7auwaCm7bYitQ1V0yG',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(26, 9, 0),
        },
        {
            id: 'eReG7OzD6HyZ2ywVP6K7Ac',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(26, 9, 12),
        },
        {
            id: 'f1bm18FOcYixT5prK2pCcV',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(23, 11, 0),
        },
        {
            id: 'MqxWBCMVJOc0RfEXCEUiEo',
            entity_id:
                'XGJklKFO4aUtjSAEHEE8Zn',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(21, 14, 0),
        },
        // happy-path WO17: DC sojourn 1 day
        {
            id: 'G83ZLOMIsgg486X9QDNXvC',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(23, 8, 30),
        },
        {
            id: '6FaR1TmuHJgxw7KW1g8sbf',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(23, 8, 42),
        },
        {
            id: 'qsNwh43wdaGqGjeKeaAeh4',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(22, 10, 0),
        },
        {
            id: '7j8VyPb3kuq8TNVz0iPP9M',
            entity_id:
                'rtuFD9uWn5zguEHyT3fh8s',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(21, 9, 0),
        },
        // happy-path WO18: DC sojourn 4 days
        {
            id: 'cEd2hUuCY4EOandCCx6bQX',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(20, 10, 0),
        },
        {
            id: 'ZywDPM0MCJeweinimZA6wH',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(20, 10, 18),
        },
        {
            id: 'G5LYG1yT8213GM9zfqqKmU',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(16, 9, 0),
        },
        {
            id: 'GUjeLpcj82NtxqFH0gcjtB',
            entity_id:
                'XrO05MeyqldO8qm0O4VPdq',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(14, 14, 0),
        },
        // happy-path WO19: DC sojourn 8 days (fat tail)
        {
            id: '8woeY7cfbuSKMFI4wMrQZH',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(17, 9, 0),
        },
        {
            id: 'OJ5bx5CPsfeb8A1ieKyeQ7',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(17, 9, 20),
        },
        {
            id: 'uQQcXyLLxrVFiydl7FCGOZ',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(9, 10, 0),
        },
        {
            id: 'L1hWSVRmSjhvzoQUPDDhMc',
            entity_id:
                'S74N7CPA2dsMESryJNrFAC',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(7, 14, 0),
        },
        // happy-path WO20: DC sojourn 2 days
        {
            id: 'ZNE2sS8KyRpIzMAq7lR4uA',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(14, 8, 0),
        },
        {
            id: 'ahjiruKeA9qdnMDO4TZf39',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(14, 8, 15),
        },
        {
            id: '7ZtemWfFZOqf9SuQVzUwp6',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(12, 11, 0),
        },
        {
            id: 'w36jEVysbnbIdaPhjIcvDI',
            entity_id:
                'Cr8KZH5Q2j5n8Q8Yw3qdMw',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(10, 9, 0),
        },
        // happy-path WO21: DC sojourn 3 days
        {
            id: 'SSLVclkfoa6nJhoffBS2Zm',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(11, 10, 30),
        },
        {
            id: 'mSCE3Z6y5RpTb74TEW62ky',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(11, 10, 48),
        },
        {
            id: 'smCeF7cSnQQaysWwJPsiTu',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(8, 14, 0),
        },
        {
            id: 'KFrDOkEJ3SiUVB3OR29ntN',
            entity_id:
                '4T56gYme7ae4Ya7AMA0hpW',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(6, 10, 0),
        },
        // happy-path WO22: DC sojourn 1 day
        {
            id: 'fwVQwEUQ8xG4McvCnNVFIV',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(9, 9, 0),
        },
        {
            id: 'UlPzcQK7dJWr6sLiV7qvfh',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(9, 9, 10),
        },
        {
            id: 'aicMwA0QmZUEzeUtlmQOOS',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(8, 10, 0),
        },
        {
            id: 'ADeYyyUb4p3eknFC5v6nW2',
            entity_id:
                'aFCyJrvokoJM5iINwO3WCf',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(7, 9, 0),
        },
        // happy-path WO23: DC sojourn 2 days
        {
            id: 'DANvBctxus8NEMcTOUy1hi',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(6, 11, 0),
        },
        {
            id: '3EOMPhhyYNW6pY6LnIegUt',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(6, 11, 15),
        },
        {
            id: 'CYglhrk5PKScZSwHQX65Ss',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(4, 9, 0),
        },
        {
            id: 'hVa7HADjYHSSsW2qxPPzTw',
            entity_id:
                'Sr4k75y6vuKODCA9zlSUjk',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(2, 14, 0),
        },
        // needs-revision WO24: double loop DC->Review->DC
        // twice, creating a 3rd distinct completed path
        {
            id: 'jNY1G5bpJ6aXd9s8hgqRtN',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(77, 9, 0),
        },
        {
            id: 'dHUzDlpmED6x7Hv24kR2nB',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(77, 9, 10),
        },
        {
            id: '0LxzRUVeucbfu95bWGkq75',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(75, 11, 0),
        },
        {
            id: 'CiXBfp5CJ8ZAWNahki1Cu8',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(74, 14, 0),
        },
        {
            id: 'wGVP4JjVdAS6FtQrhTGrC7',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(73, 10, 0),
        },
        {
            id: 'caS4tLtoEUOaPLr2VUxScZ',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(72, 14, 0),
        },
        {
            id: 'bQsLuRYpBTppyQtdZqtR5L',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(71, 10, 0),
        },
        {
            id: 'eKFDk2YAO7K93hcrnIveru',
            entity_id:
                'Mm6KUpykGSwjD7YofI6zpb',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(70, 9, 0),
        },
        // needs-revision WO25: loops DC->Review->DC
        {
            id: '0Zmtiyp7rFFameCdQwawr7',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(63, 10, 0),
        },
        {
            id: 'lvvaw4Yx5lJnHZoLB3fQqI',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(63, 10, 15),
        },
        {
            id: 'NkrcEkNWD9bu9ntBee8JnO',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(61, 14, 0),
        },
        {
            id: 'H7PRtRrjeAoPlty7IxnTTF',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(60, 22, 0),
        },
        {
            id: 'Xjy85N6xcsUc0dCe49kC1h',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(59, 14, 0),
        },
        {
            id: '3IwmCFVLZn4y18iTwydMpO',
            entity_id:
                'BbZ3Z7OZnFmdF5MBgVIYzI',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(58, 9, 0),
        },
        // needs-revision WO26: loops DC->Review->DC
        {
            id: '993Ka1UzsvcerLiBQkW8nn',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(50, 8, 30),
        },
        {
            id: 'EIo4tqqUH9XBmTxLKQa3wY',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(50, 8, 45),
        },
        {
            id: 'Q05vkdZMSIHF8dFhFdu2T9',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(48, 11, 0),
        },
        {
            id: 'f4raRzWhac1d0qfMW4bHCo',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(47, 14, 0),
        },
        {
            id: '8lTjUXAaJGsmi28M5VvnEs',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(46, 10, 0),
        },
        {
            id: 'GNbLd7I9sqHDpu4xKbBdjV',
            entity_id:
                'NydsTqMmCgEKI7R9xxp36g',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(44, 14, 0),
        },
        // needs-revision WO27: loops DC->Review->DC
        {
            id: 'CXA7kHHLRi4K7kuhFrrzpa',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(38, 9, 0),
        },
        {
            id: 't1qnertaXJmzaaELr6IsYU',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(38, 9, 18),
        },
        {
            id: 'h59lAwdhgMdefl9RisCCj7',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(36, 14, 0),
        },
        {
            id: 'c7ikZyOjtqlGuoz9zODuHy',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(35, 22, 0),
        },
        {
            id: 'eKSPOrAHWb6CNNMhRQTYKt',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(34, 14, 0),
        },
        {
            id: 'zGJlSHo6fbztITB52k1vuP',
            entity_id:
                'x2uQev3HutthrUWRFkXSkH',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(33, 9, 0),
        },
        // needs-revision WO28: loops DC->Review->DC
        {
            id: 'ZHtYaVGAAmYCcJYUbDsEZl',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(25, 10, 0),
        },
        {
            id: '9SqVX67zSGRvJr6LzgLoqA',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(25, 10, 20),
        },
        {
            id: 'tgkwKH3qWOdn2BcWaazkdN',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(23, 14, 0),
        },
        {
            id: 'IGUf2HrDyAJCpT1OrdBEdb',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(22, 14, 0),
        },
        {
            id: 'PxLFPaM23m2rQXIzeJIywN',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(21, 10, 0),
        },
        {
            id: '01Xeks1usn4PgpxH0QwyHi',
            entity_id:
                'w7XA9UnuYI7e46RTQL1xGW',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(19, 14, 0),
        },
        // needs-revision WO29: loops DC->Review->DC
        {
            id: 'UsCm8zcTD7V2b5csEp7Mcr',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(12, 9, 30),
        },
        {
            id: 'eRBpgQtP1g4IrauEEkfOCl',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(12, 9, 45),
        },
        {
            id: 'vfWjLYPYadU0NFA6mk7yRl',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(11, 11, 0),
        },
        {
            id: 'G2eaGEcEP0s7q8ThefRKze',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(10, 14, 0),
        },
        {
            id: 'ZstKsrHfLjCwfx2qFso2ZR',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(9, 11, 0),
        },
        {
            id: 'BZ2RDP2rbCFKJvqqERE7eE',
            entity_id:
                '3H3XeeNE4rS2wbANs3JvYz',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(8, 9, 0),
        },
        // in-flight WO30: sitting in Data Capture
        {
            id: '6DutgmmGcJ1gqIvJgAcUHc',
            entity_id:
                'i7YYgKN3ZUlrkulQ2aWdIE',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(18, 9, 0),
        },
        {
            id: '8IEmMehaWoNrxS2NNocSNE',
            entity_id:
                'i7YYgKN3ZUlrkulQ2aWdIE',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(18, 9, 15),
        },
        // in-flight WO31: sitting in Data Capture
        {
            id: 'y0Mx6OUCbfA0HXgyqArpcv',
            entity_id:
                '0brjvcoPEVBwMkUQ3tKHWc',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(10, 10, 0),
        },
        {
            id: 'xPBiF7zri62itn9FCXWtUE',
            entity_id:
                '0brjvcoPEVBwMkUQ3tKHWc',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(10, 10, 20),
        },
        // in-flight WO32: sitting in Data Capture
        {
            id: 'vX4jtsFFLGpU3CXPRpdCrv',
            entity_id:
                'mTdhglHhl7pM0mKt0M2IjF',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(7, 8, 0),
        },
        {
            id: 'du3liNmXeejdDA0OMRfibW',
            entity_id:
                'mTdhglHhl7pM0mKt0M2IjF',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(7, 8, 12),
        },
        // in-flight WO33: sitting in Review
        {
            id: 'YhSbU5pZG78ab0G4SepE3j',
            entity_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(4, 9, 0),
        },
        {
            id: 'oapOBSYlGiuRXZDQoODFj7',
            entity_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(4, 9, 18),
        },
        {
            id: '4GQOHCMoSVszRiPyPIEJFj',
            entity_id:
                'GMhfH8lMQJXzE4vkjnSH1u',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(3, 14, 0),
        },
        // in-flight WO34: sitting in Review
        {
            id: 'W1A4TYQHkFgG0ijSUUQPR1',
            entity_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(2, 11, 0),
        },
        {
            id: 'IUWLLWpuMM5EHbpESuAG13',
            entity_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(2, 11, 20),
        },
        {
            id: 'IvGW6Yw71dy7s5wmMEYxDr',
            entity_id:
                'pLxCFGOINXVaXmrS0VG0vC',
            state: woNodeReview,
            worker_id: woPersonCurrent,
            at: dt(1, 10, 0),
        },
        // out-of-clan WO35: Sarah (not in DC workers)
        // transitions DC out
        {
            id: 'uGXz0fPBwWaBQcviQP5ZsV',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(35, 9, 0),
        },
        {
            id: 'cEFDawHdIHfIaZQYGhH5xu',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(35, 9, 12),
        },
        {
            id: 'MGhDId9jZaFJZ5fBhnrGem',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeReview,
            worker_id: woPersonSarah,
            at: dt(33, 10, 0),
        },
        {
            id: 'Zch8By7ZpKFDwCNMEPI62h',
            entity_id:
                'IyrpZrIl2hbmmnCtiifEGm',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(31, 14, 0),
        },
        // out-of-clan WO36: Mike (not in DC workers)
        // transitions DC out
        {
            id: 'VrxyiUJqWcdd3hBdMyoTBt',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(22, 10, 30),
        },
        {
            id: 'yikZQBGGjkiZXksUJM3gkS',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(22, 10, 45),
        },
        {
            id: '0J4UMtQY7x8cfN8FNXaToL',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeReview,
            worker_id: woPersonMike,
            at: dt(20, 11, 0),
        },
        {
            id: 'XqSDgqjNZLihLPd2MX8fRR',
            entity_id:
                'zYnDWBV4VP5guzW5fDWtHN',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(18, 14, 0),
        },
        // old WO37: straddles window edge; Create+DC
        // entry at dt(108) but DC exit at dt(8) so
        // only the in-window ~82 days of DC sojourn
        // count toward heat (exercises window clipping)
        {
            id: 'QsV9mE5GIUpMXGh3SVTCB7',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeNew,
            worker_id: woPersonMike,
            at: dt(108, 9, 0),
        },
        {
            id: 'pq0sBjRnF8XBooRpIPhsQp',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeCapture,
            worker_id: woPersonMike,
            at: dt(108, 9, 15),
        },
        {
            id: 'BNbXMdM5RReniv5obnnHF8',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(8, 10, 0),
        },
        {
            id: 'txMcs1q11W87MhhBuR83vx',
            entity_id:
                '7HX7RPwlYopHWfD7I0QAPs',
            state: woNodeComplete,
            worker_id: woPersonSarah,
            at: dt(5, 14, 0),
        },
        // old WO38: all transitions ~100-103 days ago,
        // entirely outside the 90-day window; contributes
        // ~0 to heat stats
        {
            id: 'jobf5lBzIn2MPw34grYi2d',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeNew,
            worker_id: woPersonSarah,
            at: dt(103, 10, 0),
        },
        {
            id: 'o97Okl09WcFIc5EHkfBNL0',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeCapture,
            worker_id: woPersonSarah,
            at: dt(103, 10, 18),
        },
        {
            id: '783y3zl2CZTp98AaqPhggs',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeReview,
            worker_id: woPersonMarcus,
            at: dt(101, 11, 0),
        },
        {
            id: 'HXbhOvQZXx6DnrRB0T3mve',
            entity_id:
                'EXphSopBU1Is2TH4QZo4nO',
            state: woNodeComplete,
            worker_id: woPersonMike,
            at: dt(100, 9, 0),
        },
        // prc01: happy path, ~3 day draft sojourn
        {
            id: 'fGWA9Dk2EKdOzT2DDU9XOC',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeStart,
            worker_id: woPersonSarah,
            at: dt(60, 9, 0),
        },
        {
            id: '3ksjRuCLxe6hNXR0dNzxWQ',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeDraft,
            worker_id: woPersonSarah,
            at: dt(60, 9, 5),
        },
        {
            id: 'uWiv67EN75R9nQ1njZxhuv',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeSubmit,
            worker_id: woPersonMike,
            at: dt(57, 10, 0),
        },
        {
            id: 'odxDZFFHmZwFy1FmpUuxU5',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeTriage,
            worker_id: woPersonMike,
            at: dt(57, 10, 30),
        },
        {
            id: 'AC5WlYdwXBnnE58qHaHmIo',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeQuickRev,
            worker_id: woPersonMarcus,
            at: dt(57, 11, 0),
        },
        {
            id: 'RgZgN0b8utwKl61fc4TzZP',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeDecision,
            worker_id: woPersonMarcus,
            at: dt(56, 14, 0),
        },
        {
            id: 'z6hNmYbEWvegszxhwcJ61f',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeApproved,
            worker_id: woPersonSarah,
            at: dt(56, 15, 0),
        },
        {
            id: 'XdBVq4IIUbuiefP1w0g0yu',
            entity_id:
                'hRPNkjrYBTQqzzFe1t8FH6',
            state: prcNodeArchive,
            worker_id: woPersonSarah,
            at: dt(55, 9, 0),
        },
        // prc02: happy path, ~2 day draft sojourn
        {
            id: 'Voznw9q5B5mGSoQek1jAHs',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeStart,
            worker_id: woPersonMike,
            at: dt(45, 10, 0),
        },
        {
            id: 'm0nfsE2rTHaRbAWuxmum9d',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeDraft,
            worker_id: woPersonMike,
            at: dt(45, 10, 10),
        },
        {
            id: 'yxbLBIMHtHgVjO74NsrNgX',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeSubmit,
            worker_id: woPersonMike,
            at: dt(43, 9, 0),
        },
        {
            id: 'z9NN5xeQ6CMu9DChJ16m1V',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeTriage,
            worker_id: woPersonMarcus,
            at: dt(43, 9, 20),
        },
        {
            id: 'UAO4qYna7zIzLSJwM8iIoh',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeQuickRev,
            worker_id: woPersonMarcus,
            at: dt(43, 10, 0),
        },
        {
            id: 'UrbW8eFstKcsHbh99uRUds',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeDecision,
            worker_id: woPersonSarah,
            at: dt(42, 14, 0),
        },
        {
            id: 'KW7NkVunQCIEUzL9R78DpF',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeApproved,
            worker_id: woPersonSarah,
            at: dt(42, 15, 0),
        },
        {
            id: 'wVgv2i4c1o7t11tIrmngjN',
            entity_id:
                'L3UhOvrAGluk4kNnN6J8NT',
            state: prcNodeArchive,
            worker_id: woPersonMike,
            at: dt(41, 10, 0),
        },
        // prc03: happy path, ~1 day draft sojourn
        {
            id: 'jMUHUNKZX9A0LJOuoDt3UQ',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeStart,
            worker_id: woPersonSarah,
            at: dt(30, 8, 0),
        },
        {
            id: '5opUgNKNUIWnlm3MnpGX9F',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeDraft,
            worker_id: woPersonSarah,
            at: dt(30, 8, 10),
        },
        {
            id: '0XabGfXLVpJqRrrA8Tmo4S',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeSubmit,
            worker_id: woPersonCurrent,
            at: dt(29, 9, 0),
        },
        {
            id: 'sbPLHxmfJUpk3tfXZ7ShRX',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeTriage,
            worker_id: woPersonCurrent,
            at: dt(29, 9, 15),
        },
        {
            id: 'CEUHkraKtR9HC4heDL8OaZ',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeQuickRev,
            worker_id: woPersonMarcus,
            at: dt(29, 10, 0),
        },
        {
            id: 'EqVBgaYCFKRwp9uIHOyVle',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeDecision,
            worker_id: woPersonMarcus,
            at: dt(28, 15, 0),
        },
        {
            id: '1DfCm0yI6ycGmVNPcudsOU',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeApproved,
            worker_id: woPersonMike,
            at: dt(28, 16, 0),
        },
        {
            id: 'lAOOAfrD4ZO0rKWfQFI8Px',
            entity_id:
                'oTscblsEOjZDkvkW3vs7rU',
            state: prcNodeArchive,
            worker_id: woPersonMike,
            at: dt(27, 9, 0),
        },
        // prc04: happy path, ~4 day draft sojourn
        {
            id: 'JOz3BgXyTUkvWLmmNGszc7',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeStart,
            worker_id: woPersonMike,
            at: dt(20, 11, 0),
        },
        {
            id: 'JpSsbb9JNMnGteG4RBWrZB',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeDraft,
            worker_id: woPersonMike,
            at: dt(20, 11, 5),
        },
        {
            id: 'dn32O6s5Ibe5aDOByr87J7',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeSubmit,
            worker_id: woPersonMarcus,
            at: dt(16, 10, 0),
        },
        {
            id: 'nFGAxCNAthhvb9m4walDUe',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeTriage,
            worker_id: woPersonSarah,
            at: dt(16, 10, 20),
        },
        {
            id: 'fjM70dtNCzEFNoQ6cjJCWO',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeQuickRev,
            worker_id: woPersonSarah,
            at: dt(16, 11, 0),
        },
        {
            id: '12eJcjUwJ7G1iqPAU6cSx0',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeDecision,
            worker_id: woPersonSarah,
            at: dt(15, 14, 0),
        },
        {
            id: 'eM38EYOkl4REWI8y8IhCzA',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeApproved,
            worker_id: woPersonMike,
            at: dt(15, 15, 30),
        },
        {
            id: 'Vx8TlX4GIyRQPYS6oocHhd',
            entity_id:
                'Xpw9VGpZ6RyevuInSr8yze',
            state: prcNodeArchive,
            worker_id: woPersonMike,
            at: dt(14, 9, 0),
        },
        // prc05: revisit -- Decision sends to
        // Revise, then Draft again, then completes
        {
            id: '4PaHruvvvyktmxiaGvTjM2',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeStart,
            worker_id: woPersonSarah,
            at: dt(15, 9, 0),
        },
        {
            id: 'WMNTfIbJPW1m39FOKqMZhH',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDraft,
            worker_id: woPersonSarah,
            at: dt(15, 9, 10),
        },
        {
            id: 'tMWEwY6qb3ICXZtz6P28Ut',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeSubmit,
            worker_id: woPersonMike,
            at: dt(14, 10, 0),
        },
        {
            id: 'gOUPiWUJiZa99BUOQTrYjh',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeTriage,
            worker_id: woPersonMike,
            at: dt(14, 10, 15),
        },
        {
            id: 'zQbr7dr0N8gG14HJT8hCop',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeQuickRev,
            worker_id: woPersonMarcus,
            at: dt(14, 11, 0),
        },
        {
            id: 'c1O3BtoItm3bp1owvVmVWY',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDecision,
            worker_id: woPersonMarcus,
            at: dt(13, 14, 0),
        },
        // Decision routes to Revise (revisit)
        {
            id: '3g2Tomp04bLGvwNRss9zCi',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeRevise,
            worker_id: woPersonCurrent,
            at: dt(13, 15, 0),
        },
        // Revise sends back to Draft
        {
            id: 'clXy8qWTzs8eNo3YaNi3Q5',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDraft,
            worker_id: woPersonSarah,
            at: dt(12, 9, 0),
        },
        {
            id: 'T0hms37kIuFsjCmKKnt5Je',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeSubmit,
            worker_id: woPersonSarah,
            at: dt(11, 10, 0),
        },
        {
            id: 'GnfjTPti69qF7OyWRdJTQV',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeTriage,
            worker_id: woPersonMike,
            at: dt(11, 10, 20),
        },
        {
            id: 'QnMQPkZbvU0IPt6XODVj2K',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeQuickRev,
            worker_id: woPersonMike,
            at: dt(11, 11, 0),
        },
        {
            id: 'boVwgdzs2FbJ3lV2BK6rFe',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeDecision,
            worker_id: woPersonMarcus,
            at: dt(10, 14, 0),
        },
        {
            id: 'JeIgVixuJXQgtsLJ2jVEV6',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeApproved,
            worker_id: woPersonMarcus,
            at: dt(10, 15, 0),
        },
        {
            id: 'N09pFEf67fHMeaf5d9Hmud',
            entity_id:
                'yqPpJb0NoQDgx8DoZ183Nx',
            state: prcNodeArchive,
            worker_id: woPersonSarah,
            at: dt(9, 9, 0),
        },
        // prc06: in-flight -- stuck at Decision
        {
            id: 'iGftzPJwYdoaZr4Hm5MlsE',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeStart,
            worker_id: woPersonMike,
            at: dt(5, 10, 0),
        },
        {
            id: 'sCPs7p4WtQgm0VuR81yMyy',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeDraft,
            worker_id: woPersonMike,
            at: dt(5, 10, 8),
        },
        {
            id: 'bHOxRfjKzqHi2DH8w3I8Xg',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeSubmit,
            worker_id: woPersonCurrent,
            at: dt(4, 11, 0),
        },
        {
            id: 'LlXYA4dYJtau7GSAu2549Z',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeTriage,
            worker_id: woPersonSarah,
            at: dt(4, 11, 20),
        },
        {
            id: 'pojq7QRvrUQorLUztKWUW5',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeQuickRev,
            worker_id: woPersonSarah,
            at: dt(4, 12, 0),
        },
        {
            id: 'C4i8pmiwfwvwRFk19mjOa8',
            entity_id:
                'BUrGEVDMF6FeU35WUHUY5E',
            state: prcNodeDecision,
            worker_id: woPersonMarcus,
            at: dt(3, 14, 0),
        },
        // stays at Decision -- no more transitions
    ];

    const mockStateFieldValues:
        StateFieldValueEntity[] = [
        {
            id: '4izDJCuygAL7iqjeHdephl',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            field_id: fCompanyName,
            value: 'Acme Corp',
        },
        {
            id: 'NBmVbZMOWPSMZ11zhTpzEQ',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            field_id: fEmail,
            value: 'onboard@acme.com',
        },
        {
            id: 'lxSMfOtoXk89FTuxLj895r',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            field_id: fPhone,
            value: '+1-555-0100',
        },
        {
            id: 'F8Cagh2PlkwHakidXqGEXq',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            field_id: fIndustry,
            value: 'Technology',
        },
        {
            id: '57xrfe07Pqj38qvutRJk2N',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            field_id: fRevenue,
            value: '5000000',
        },
        {
            id: 'juYwNY2S35qCJqT3SAnwyW',
            state_event_id: 'eJEybxfXaf3sjwFilZnunU',
            field_id: fEmployees,
            value: '250',
        },
        {
            id: 'vtXOj3CjsGIYGlnds0FSJd',
            state_event_id: 'C2xb2bbjyHD11WfLayh8Om',
            field_id: fReviewerNotes,
            value: 'Approved. Strong fit.',
        },
    ];

    const mockProjectFlows:
        ProjectFlowEntity[] = [
        {
            id: 'noogjofVfg6jFxYOVbdAnC',
            project_id: 'u6YkHhlGc91oDMkr3x0isa',
            flow_id: 'h5mErVBQhwdMKwi1co30jB',
            at: wfTimestamp,
        },
        {
            id: '5ddqhtwd3qcdodXLcsDdyt',
            project_id: 'jRE2Tj32NHsFGZIeEADp0p',
            flow_id: 'E2BnBlZyrriqsQYkmS4usb',
            at: wfTimestamp,
        },
        {
            id: '9YX7ZU4br6zxrHyVcmRjJP',
            project_id: 'u6YkHhlGc91oDMkr3x0isa',
            flow_id: '7COt7Kf4OaOBg6AjaNO04s',
            at: wfTimestamp,
        },
        {
            id: l2cProjectFlowId,
            project_id: l2cProjectId,
            flow_id: l2cFlowId,
            at: wfTimestamp,
        },
    ];

    const leadToClosePaths:
        PathProfile[] = [
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
                l2cWonEdgeId,
            ],
            weight: 0.45,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cDisqualifyEdgeId,
            ],
            weight: 0.20,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cNeedsInfoEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
                l2cWonEdgeId,
            ],
            weight: 0.15,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
                l2cReviseEdgeId,
                l2cSubmitEdgeId,
                l2cWonEdgeId,
            ],
            weight: 0.12,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
            ],
            weight: 0.08,
        },
    ];

    const leadToCloseSojourn:
        SojournProfile = {
        meanHoursByNodeId:
            new Map<Id, number>([
                [l2cTriageNodeId, 8],
                [l2cDiscoveryNodeId, 36],
                [l2cQualifNodeId, 22 * 24],
                [l2cProposalNodeId, 24],
                [l2cNegotNodeId, 24],
            ]),
        sigmaByNodeId:
            new Map<Id, number>([
                [l2cTriageNodeId, 0.5],
                [l2cDiscoveryNodeId, 0.5],
                [l2cQualifNodeId, 1.4],
                [l2cProposalNodeId, 0.5],
                [l2cNegotNodeId, 0.5],
            ]),
    };

    const leadToCloseSkill: WorkerSkill = {
        byWorkerAndNode: new Map<
            Id, ReadonlyMap<Id, number>
        >([
            [workerSarah, new Map<
                Id, number
            >([
                [l2cDiscoveryNodeId, 0.75],
                [l2cQualifNodeId, 0.55],
                [l2cProposalNodeId, 0.80],
                [l2cNegotNodeId, 0.70],
            ])],
            [workerMarcus, new Map<
                Id, number
            >([
                [l2cDiscoveryNodeId, 1.10],
                [l2cQualifNodeId, 1.10],
            ])],
            [workerMike, new Map<
                Id, number
            >([
                [l2cProposalNodeId, 0.85],
            ])],
            [workerLisa, new Map<
                Id, number
            >([
                [l2cTriageNodeId, 0.90],
            ])],
            [workerClaude, new Map<
                Id, number
            >([
                [l2cTriageNodeId, 0.60],
            ])],
        ]),
        jitterPct: 0.15,
    };

    const leadToCloseSpec: FlowSeedSpec = {
        flowId: l2cFlowId,
        name: 'Lead-to-Close',
        description: leadToCloseDescription,
        nodes: leadToCloseNodes,
        edges: leadToCloseEdges,
        creator: leadToCloseNodes[0]!,
        archive: leadToCloseNodes[6]!,
    };

    const leadToCloseData =
        generateFlowWorkload({
            flow: leadToCloseSpec,
            paths: leadToClosePaths,
            sojourn: leadToCloseSojourn,
            skill: leadToCloseSkill,
            totalWorkOrders: 100,
            oldestDaysAgo: 80,
            newestDaysAgo: 5,
            seed: 0xC0DEF00D,
        });

    await Promise.all([
        ...projects.map(project =>
            adapter.projects.put(
                project.id,
                project,
            ),
        ),
        ...mockFlows.map(flow =>
            adapter.flows.put(
                flow.id, flow,
            ),
        ),
    ]);

    const ideaSubmissions:
        IdeaSubmissionEntity[] = [
        {
            id: 'k4dY2dPq90mQVwwCkhWIo3',
            idea_id: 'eT5xdKjzLDmuRn3r7XMX4R',
            worker_id: 'LhfaUUf4IumVsCSGB4xjdK',
            at: dt(75, 9, 30),
        },
        {
            id: 'XC7hsfNJueKQ8q0UfCuC7o',
            idea_id: 'cbTuSs0Ex84PeFGSvoAEFZ',
            worker_id: 'bLP3X1hb1mSz8gY9neogU3',
            at: dt(70, 9, 0),
        },
        {
            id: 'YmzT46BbGVFALpiXFDnlVd',
            idea_id: 'wuCMQqo4IkEksx7MYmu8g2',
            worker_id: '53J8h9dr76XFqCjYcNVwIR',
            at: dt(65, 9, 0),
        },
        {
            id: 'cmoTu4GRGmO8y5QrfPIHSm',
            idea_id: 'ojOEXtdzdtTZtpM81TxVca',
            worker_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            at: dt(55, 9, 0),
        },
        {
            id: 'kIUtvgTOLPjsSmAEVOhPb1',
            idea_id: 'T2vAafLDcshDONlYxpzPLc',
            worker_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            at: dt(50, 9, 0),
        },
        {
            id: 'r04u9qpJKSyNjP9Owxr5Be',
            idea_id: 'HRYrImq1rBJ5ZRe1T9TAVk',
            worker_id: 'zyTbfbjcGEfbpCsNTP0XjX',
            at: dt(45, 9, 0),
        },
        {
            id: '2mPJTlujj1RF6gexFwbDqJ',
            idea_id: 'MCxK0hzT9CPjJx1ZV5unfr',
            worker_id: 'LhfaUUf4IumVsCSGB4xjdK',
            at: dt(75, 10, 0),
        },
        {
            id: 'caBSqTgzDnvP8joamAG9OG',
            idea_id: 'SUb4gKXsZ1OsEauzqszg0t',
            worker_id: 'WxQn4LVWb76YkmqK5B0EPp',
            at: dt(35, 9, 0),
        },
        {
            id: 'UfsCp7WYUybhwxD170okb4',
            idea_id: 'gxa84W9KvEgD0wT1F4TOM9',
            worker_id: '53J8h9dr76XFqCjYcNVwIR',
            at: dt(30, 9, 0),
        },
        {
            id: 'mbTZAQbC5cJSEIzhEEFpyq',
            idea_id: '1Z68gROMrlTAfPEGiyJJAY',
            worker_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            at: dt(25, 9, 0),
        },
        {
            id: '0LjTHFflWNaDZkKDqxmwJi',
            idea_id: 'Q2On2xwMpFdzOklBQJXrni',
            worker_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            at: dt(20, 9, 0),
        },
    ];

    // One state event per seeded idea — the
    // current state of each idea on the states
    // log. Stage 8b+c retires the dual-column
    // representation; the log IS the truth. Each
    // event is authored by the idea's submitter
    // at submission time. UI surfaces this as the
    // composite state badge.
    const ideaStateEvents: StateEntity[] = [
        {
            id: 'qJoFXyzUUaq0vEpHL5e34l',
            entity_id: 'eT5xdKjzLDmuRn3r7XMX4R',
            state: 'in-review',
            worker_id: 'LhfaUUf4IumVsCSGB4xjdK',
            at: dt(75, 9, 30),
        },
        {
            id: 'tIcL6f8KJoyG2YN9NofOMo',
            entity_id: 'cbTuSs0Ex84PeFGSvoAEFZ',
            state: 'approved',
            worker_id: 'bLP3X1hb1mSz8gY9neogU3',
            at: dt(70, 9, 0),
        },
        {
            id: 'mGfBLqA7lScpEKxc5w0Yt2',
            entity_id: 'wuCMQqo4IkEksx7MYmu8g2',
            state: 'active:needs-info',
            worker_id: '53J8h9dr76XFqCjYcNVwIR',
            at: dt(65, 9, 0),
        },
        {
            id: 'BvBRvDQ8b5l5Tg7iZSGyHF',
            entity_id: 'ojOEXtdzdtTZtpM81TxVca',
            state: 'in-review',
            worker_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            at: dt(55, 9, 0),
        },
        {
            id: 'BMS9TmTKR0DZ41vTUSpvxX',
            entity_id: 'T2vAafLDcshDONlYxpzPLc',
            state: 'active:needs-info',
            worker_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            at: dt(50, 9, 0),
        },
        {
            id: 'XX2EXrIUcQVTnzGo0YO2Iw',
            entity_id: 'HRYrImq1rBJ5ZRe1T9TAVk',
            state: 'sent-back',
            worker_id: 'zyTbfbjcGEfbpCsNTP0XjX',
            at: dt(45, 9, 0),
        },
        {
            id: 'fxlbcnsAmCWp4j8B2NkDKM',
            entity_id: 'MCxK0hzT9CPjJx1ZV5unfr',
            state: 'in-review',
            worker_id: 'LhfaUUf4IumVsCSGB4xjdK',
            at: dt(75, 10, 0),
        },
        {
            id: 'JjkkkkrZw4FvOWBpJYE2J7',
            entity_id: 'SUb4gKXsZ1OsEauzqszg0t',
            state: 'in-review',
            worker_id: 'WxQn4LVWb76YkmqK5B0EPp',
            at: dt(35, 9, 0),
        },
        {
            id: '4nzdNB97hgD1GZ7CjA2EwS',
            entity_id: 'gxa84W9KvEgD0wT1F4TOM9',
            state: 'in-review',
            worker_id: '53J8h9dr76XFqCjYcNVwIR',
            at: dt(30, 9, 0),
        },
        {
            id: 'wmCY9xZdrk0XlydyABZqXY',
            entity_id: '1Z68gROMrlTAfPEGiyJJAY',
            state: 'in-review',
            worker_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            at: dt(25, 9, 0),
        },
        {
            id: 'OWGsZqEi1bnWUetzS2sURr',
            entity_id: 'Q2On2xwMpFdzOklBQJXrni',
            state: 'in-review',
            worker_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            at: dt(20, 9, 0),
        },
    ];

    // One state event per seeded project — the
    // current state of each project on the states
    // log. Stage 9b+c retires the dual-column
    // representation; the log IS the truth. Events
    // are authored by SYSTEM_WORKER_ID at project
    // start time. UI surfaces this as the state
    // badge.
    const projectStateEvents: StateEntity[] = [
        {
            id: 'pSe01Cu5tSegmAi5pEv01',
            entity_id: 'u6YkHhlGc91oDMkr3x0isa',
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(60, 9, 0),
        },
        {
            id: 'pSe02Aut0Rep0rtComp02',
            entity_id: 'jRE2Tj32NHsFGZIeEADp0p',
            state: 'completed',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(110, 9, 0),
        },
        {
            id: 'pSe03SalesP1p3App03Z',
            entity_id: l2cProjectId,
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(55, 9, 0),
        },
        {
            id: 'pSe04PredMa1ntRev04AB',
            entity_id: 'P04PredMa1ntzyXY010203',
            state: 'under-review',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(18, 9, 0),
        },
        {
            id: 'pSe05RtAna1ytComp05CD',
            entity_id: 'P05RtAna1ytcsXY010203Z',
            state: 'completed',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(95, 9, 0),
        },
        {
            id: 'pSe06SmInvOptSnt06EF',
            entity_id: 'P06SmInvOptZyXY010203A',
            state: 'sent-back',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(38, 9, 0),
        },
        {
            id: 'pSe07Empl0yTraRev07GH',
            entity_id: 'P07Empl0yTrainZyXY00B0',
            state: 'under-review',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(12, 9, 0),
        },
        {
            id: 'pSe08CustSuppApp08IJ',
            entity_id: 'P08CustSuppKn0wXY01C0D',
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(48, 9, 0),
        },
        {
            id: 'pSe09C0mp1AudApp09KL',
            entity_id: 'P09C0mp1AudAut0mXY01E0',
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(72, 9, 0),
        },
        {
            id: 'pSe10MlRgD1s4App10MN',
            entity_id: 'P10MlRgD1s4stRc1XY01FG',
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(82, 9, 0),
        },
        {
            id: 'pSe11V0iceField11OPQ',
            entity_id: 'P11V0iceField0psXY01HJ',
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(40, 9, 0),
        },
        {
            id: 'pSe12CarbF00tCmp12RS',
            entity_id: 'P12CarbF00tprXY01K0L0M',
            state: 'completed',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(120, 9, 0),
        },
        {
            id: 'pSe13W0rk4rcRev13TU',
            entity_id: 'P13W0rk4rcF0r3castsXY1',
            state: 'under-review',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(22, 9, 0),
        },
        {
            id: 'pSe14SmartD0cAp14VWX',
            entity_id: 'P14SmartD0cumtR0utngX1',
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(65, 9, 0),
        },
        {
            id: 'pSe15Inv3st0rAp15YZA',
            entity_id: 'P15Inv3st0rRep0rtP1Y00',
            state: 'approved',
            worker_id: SYSTEM_WORKER_ID,
            at: dt(58, 9, 0),
        },
    ];

    // One state event per seeded flow — the
    // creation moment of each flow on the states
    // log. Tier 2.3 retires FlowEntity.created_at
    // / updated_at; the log IS the truth. Events
    // are authored by SYSTEM_WORKER_ID at the
    // shared wfTimestamp moment.
    const flowStateEvents: StateEntity[] = [
        {
            id: 'fSe01CustomerOnboard0aA',
            entity_id:
                'h5mErVBQhwdMKwi1co30jB',
            state: 'active',
            worker_id: SYSTEM_WORKER_ID,
            at: wfTimestamp,
        },
        {
            id: 'fSe02FusionFl0w0aActiv',
            entity_id:
                'E2BnBlZyrriqsQYkmS4usb',
            state: 'active',
            worker_id: SYSTEM_WORKER_ID,
            at: wfTimestamp,
        },
        {
            id: 'fSe03Lay0utTest0aActiv',
            entity_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            state: 'active',
            worker_id: SYSTEM_WORKER_ID,
            at: wfTimestamp,
        },
        {
            id: 'fSe04L3adt0Cl0se0aActiv',
            entity_id: l2cFlowId,
            state: 'active',
            worker_id: SYSTEM_WORKER_ID,
            at: wfTimestamp,
        },
    ];

    const aiWorkers: AIWorkerEntity[] = [
        {
            id: 'tuJwPxYtBur2KCLquScShB',
            name: 'Claude Opus 4.7 Max',
            provider: 'Anthropic',
            description:
                'Anthropic flagship — long'
                + ' context, deep reasoning.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
        },
        {
            id: 'LdoTR1fnyYpS1jPzEs57ek',
            name: 'Claude Sonnet 4.6',
            provider: 'Anthropic',
            description:
                'Anthropic mid-tier — fast'
                + ' and capable.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
        },
        {
            id: 'Xv89xOCXR6awwoXcPvEY9Y',
            name: 'GPT-5.4 Pro',
            provider: 'OpenAI',
            description:
                'OpenAI multimodal flagship.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
        },
        {
            id: '42vHYDCvtkaO3sTnoqg7aJ',
            name: 'Grok 4.20 Heavy',
            provider: 'xAI',
            description:
                'xAI heavy-compute model.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
        },
    ];

    // AI workers start at 'active' on creation.
    // Same single-event seeding as humans.
    for (const ai of aiWorkers) {
        workerStateEvents.push({
            id: `seed-worker-${ai.id}-active`,
            entity_id: ai.id,
            state: 'active',
            worker_id: SYSTEM_WORKER_ID,
            at: MOCK_SEED_TIMESTAMP,
        });
    }

    await Promise.all([
        ...ideaSubmissions.map(r =>
            adapter.ideaSubmissions.put(
                r.id, r,
            ),
        ),
        ...mockProjectFlows.map(r =>
            adapter.projectFlows.put(
                r.id, r,
            ),
        ),
        ...mockWorkOrders.map(r =>
            adapter.workOrders.put(
                r.id, r,
            ),
        ),
        ...mockFlowWorkOrders.map(r =>
            adapter.flowWorkOrders.put(
                r.id, r,
            ),
        ),
        ...mockStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                worker_id: r.worker_id,
                at: r.at,
            }),
        ),
        ...ideaStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                worker_id: r.worker_id,
                at: r.at,
            }),
        ),
        ...projectStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                worker_id: r.worker_id,
                at: r.at,
            }),
        ),
        ...flowStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                worker_id: r.worker_id,
                at: r.at,
            }),
        ),
        ...workerStateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                worker_id: r.worker_id,
                at: r.at,
            }),
        ),
        ...mockStateFieldValues.map(r =>
            adapter.stateFieldValues
                .put(r.id, r),
        ),
        ...aiWorkers.map(m =>
            adapter.aiWorkers.put(m.id, m),
        ),
        ...leadToCloseData.workOrders.map(r =>
            adapter.workOrders.put(r.id, r),
        ),
        ...leadToCloseData.flowWorkOrders
            .map(r =>
                adapter.flowWorkOrders.put(
                    r.id, r,
                ),
            ),
        ...leadToCloseData.stateEvents.map(r =>
            adapter.states.put(r.id, {
                entity_id: r.entity_id,
                state: r.state,
                worker_id: r.worker_id,
                at: r.at,
            }),
        ),
    ]);

    for (const seed of OBJECTIVE_SEEDS) {
        await adapter.objectives.put(seed.id, {
            position: seed.position,
        });
        await adapter.objectiveRevisions.put(
            `${seed.id}:${MOCK_SEED_TIMESTAMP}`,
            {
                objective_id: seed.id,
                name: seed.name,
                description: seed.description,
                at: MOCK_SEED_TIMESTAMP,
            },
        );
    }

    const allProjects = await adapter.projects.getAll();
    const projectStateById = new Map(
        projectStateEvents.map(
            ev => [ev.entity_id, ev.state],
        ),
    );

    function deterministicScore(
        seed: string,
        min: number,
        max: number,
    ): number {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) {
            hash = (hash * 31 + seed.charCodeAt(i)) | 0;
        }
        const range = max - min + 1;
        const wrapped = ((hash % range) + range) % range;
        return min + wrapped;
    }

    for (const p of allProjects) {
        const state = projectStateById.get(p.id);
        if (state === undefined) {
            throw new Error(
                'seeded project has no state event: '
                + p.id,
            );
        }
        if (
            state === 'submitted'
            || state === 'declined'
            || state === 'deleted'
        ) {
            continue;
        }

        const baselineCoverage =
            state === 'approved'
            || state === 'completed'
                ? OBJECTIVE_SEEDS.length
                : deterministicScore(
                    p.id + ':coverage',
                    0,
                    OBJECTIVE_SEEDS.length - 1,
                );

        const baselineStart =
            new Date(p.start_date).getTime();
        // Committed work (approved + completed) is
        // expected to advance objectives; baselines
        // skew positive. Drafts (under-review +
        // sent-back) can dip negative — a flagged
        // risk worth surfacing on the dashboard.
        const baselineMin =
            state === 'approved'
            || state === 'completed'
                ? 0
                : -100;
        for (let i = 0; i < baselineCoverage; i++) {
            const obj = OBJECTIVE_SEEDS[i]!;
            const score = deterministicScore(
                `${p.id}:${obj.id}:baseline`,
                baselineMin,
                100,
            );
            const scoredAt = new Date(
                baselineStart + i * 1000,
            ).toISOString();
            await adapter
                .projectObjectiveBaselineScores
                .put(
                    `${p.id}:${obj.id}:${scoredAt}`,
                    {
                        project_id: p.id,
                        objective_id: obj.id,
                        score,
                        at: scoredAt,
                    },
                );
        }

        if (
            state === 'approved'
            || state === 'completed'
        ) {
            const minActuals =
                state === 'completed' ? 1 : 0;
            const baseActualTime =
                baselineStart + MS_PER_DAY;
            for (
                let i = 0; i < OBJECTIVE_SEEDS.length; i++
            ) {
                const obj = OBJECTIVE_SEEDS[i]!;
                const nActuals =
                    minActuals
                    + deterministicScore(
                        `${p.id}:${obj.id}:nactual`,
                        0,
                        2,
                    );
                for (let k = 0; k < nActuals; k++) {
                    const score = deterministicScore(
                        `${p.id}:${obj.id}:actual:${k}`,
                        -100,
                        100,
                    );
                    const scoredAt = new Date(
                        baseActualTime
                            + (i * 10 + k) * 1000,
                    ).toISOString();
                    await adapter
                        .projectObjectiveActualScores
                        .put(
                            `${p.id}:${obj.id}:${scoredAt}`,
                            {
                                project_id: p.id,
                                objective_id: obj.id,
                                score,
                                at: scoredAt,
                            },
                        );
                }
            }
        }
    }
}

export async function populateBootstrapData(
    adapter: DbAdapter,
): Promise<void> {
    await Promise.all([
        adapter.workers.put(SYSTEM_WORKER_ID, {
            first_name: 'System',
            last_name: 'Worker',
            email: 'system@fusion.local',
            title: 'System',
            department: 'System',
            strengths: jsonArrayField([]),
            team_dimensions: jsonObjectField({}),
            phone: '',
            bio: 'Synthetic worker that owns'
                + ' system-authored state events.',
        }),
        adapter.workers.put('current', {
            first_name: 'Tony',
            last_name: 'Stark',
            email: 'demo@example.com',
            title: 'Admin',
            department: 'Product',
            strengths: jsonArrayField([
                'Strategic Planning',
                'Data Analysis',
                'Stakeholder Management',
            ]),
            team_dimensions: jsonObjectField({
                driver: 80,
                analytical: 80,
                expressive: 80,
                amiable: 80,
            }),
            phone: '+1 (555) 123-4567',
            bio: 'Passionate about building'
                + ' products that solve'
                + ' real problems.',
        }),
        adapter.states.record(
            'bootstrap-system-active',
            SYSTEM_WORKER_ID,
            'active',
            SYSTEM_WORKER_ID,
        ),
        adapter.states.record(
            'bootstrap-current-active',
            'current',
            'active',
            SYSTEM_WORKER_ID,
        ),
        adapter.organization.put({
            name: 'Stark Industries',
            domain: 'acmecorp.com',
            plan: 'Business',
            plan_status: 'active',
            next_billing: dt(-300, 0, 0),
            seats: 25,
            used_seats: 18,
            projects_limit: TIER_PROJECTS_LIMIT,
            ideas_limit: TIER_IDEAS_LIMIT,
            health_score: 92,
            health_status: 'excellent',
            last_activity: dt(0, 16, 0),
        }),
    ]);
}
