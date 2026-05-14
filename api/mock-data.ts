import type { DbAdapter } from './db.ts';
import type {
    HumanWorkerEntity,
    WorkerStatus,
    ReadinessLevel,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    FlowEntity,
    ProjectFlowEntity,
    AIWorkerEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    TransitionFieldValueEntity,
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
} from './types.ts';

const now = new Date();

const TIER_PROJECTS_LIMIT = 50;
const TIER_IDEAS_LIMIT = 200;
const TIER_STORAGE_GB = 10;
const TIER_AI_CREDITS = 1000;

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
    const y = d.getUTCFullYear();
    const mo = pad(d.getUTCMonth() + 1);
    const da = pad(d.getUTCDate());
    const h = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    return `${y}-${mo}-${da}`
        + `T${h}:${mi}:00.000000Z`;
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
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const mo = pad(d.getUTCMonth() + 1);
    const da = pad(d.getUTCDate());
    const h = pad(d.getUTCHours());
    const mi = pad(d.getUTCMinutes());
    const s = pad(d.getUTCSeconds());
    return `${y}-${mo}-${da}`
        + `T${h}:${mi}:${s}.000000Z`;
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
    readonly transitions:
        readonly WorkOrderTransitionEntity[];
}

function generateFlowWorkload(args: {
    readonly flow: FlowSeedSpec;
    readonly paths: readonly PathProfile[];
    readonly sojourn: SojournProfile;
    readonly skill: WorkerSkill;
    readonly totalWorkOrders: number;
    readonly oldestDaysAgo: number;
    readonly newestDaysAgo: number;
    readonly idPrefix: string;
    readonly seed: number;
}): GeneratedFlowData {
    const {
        flow, paths, sojourn, skill,
        totalWorkOrders, oldestDaysAgo,
        newestDaysAgo, idPrefix, seed,
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
    const transitions:
        WorkOrderTransitionEntity[] = [];

    const nowMs = now.getTime();

    for (let i = 0; i < totalWorkOrders; i++) {
        const woId = idPrefix + 'w'
            + b62Id(rng, 20);
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
        // from='' and Create-exit transitions.
        const creatorPerson = stepWorker[1]!;

        transitions.push({
            id: idPrefix + 't-'
                + pad(i) + '-00-' + woId,
            work_order_id: woId,
            from_node_id: '',
            to_node_id: path.nodeIds[0]!,
            person_id: creatorPerson,
            transitioned_at:
                isoFromMs(cursorMs),
        });

        if (N >= 2) {
            cursorMs += CREATE_DWELL_MS;
            transitions.push({
                id: idPrefix + 't-'
                    + pad(i) + '-01-' + woId,
                work_order_id: woId,
                from_node_id:
                    path.nodeIds[0]!,
                to_node_id:
                    path.nodeIds[1]!,
                person_id: creatorPerson,
                transitioned_at:
                    isoFromMs(cursorMs),
            });
        }

        for (let j = 2; j < N; j++) {
            cursorMs += stepSojournMs[j - 1]!;
            // Clamp long-tail sojourns that
            // would overrun today, so no
            // transition is future-dated.
            if (cursorMs >= nowMs) {
                cursorMs = nowMs - 1000;
            }
            transitions.push({
                id: idPrefix + 't-'
                    + pad(i) + '-'
                    + pad(j) + '-' + woId,
                work_order_id: woId,
                from_node_id:
                    path.nodeIds[j - 1]!,
                to_node_id:
                    path.nodeIds[j]!,
                person_id:
                    stepWorker[j - 1]!,
                transitioned_at:
                    isoFromMs(cursorMs),
            });
        }

        workOrders.push({
            id: woId,
            display_id: displayId,
            flow_graph: frozenFlowGraph,
            position: 100 + i,
            created_at:
                isoFromMs(createdAtMs),
        });
        flowWorkOrders.push({
            id: idPrefix + 'fwo-' + woId,
            flow_id: flow.flowId,
            work_order_id: woId,
            created_at:
                isoFromMs(createdAtMs),
        });
    }

    return {
        workOrders,
        flowWorkOrders,
        transitions,
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
};

export async function populateMockData(
    adapter: DbAdapter,
): Promise<void> {
    const workers: SeedHumanWorker[] = [
        {
            id: 'LhfaUUf4IumVsCSGB4xjdK',
            first_name: 'Sarah',
            last_name: 'Chen',
            email: 'sarah.chen@company.com',
            title: 'Project Lead',
            department: 'Operations',
            status: 'active',
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
            status: 'active',
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
            status: 'active',
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
            status: 'active',
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
            status: 'pending',
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
            status: 'active',
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
            status: 'active',
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
            status: 'active',
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
            status: 'active',
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
            status: 'deactivated',
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
            status: 'active',
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

    await Promise.all(workers.map(worker =>
        adapter.workers.put(worker.id, {
            ...worker,
            strengths:
                jsonArrayField(worker.strengths),
            team_dimensions:
                jsonObjectField(
                    worker.team_dimensions,
                ),
        }),
    ));

    const ideas: IdeaEntity[] = [
        {
            id: 'eT5xdKjzLDmuRn3r7XMX4R',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            position: 1,
            status: 'in-review',

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
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'cbTuSs0Ex84PeFGSvoAEFZ',
            title: 'Automated Report'
                + ' Generation',
            position: 2,
            status: 'approved',

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
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'wuCMQqo4IkEksx7MYmu8g2',
            title: 'Predictive Maintenance'
                + ' System',
            position: 3,
            status: 'active',

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
            readiness: 'needs-info',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'ojOEXtdzdtTZtpM81TxVca',
            title: 'Real-time Analytics'
                + ' Dashboard',
            position: 4,
            status: 'in-review',

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
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'T2vAafLDcshDONlYxpzPLc',
            title: 'Smart Inventory'
                + ' Optimization',
            position: 5,
            status: 'active',

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
            readiness: 'needs-info',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'HRYrImq1rBJ5ZRe1T9TAVk',
            title: 'Employee Training'
                + ' Assistant',
            position: 6,
            status: 'sent-back',

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
            readiness: 'incomplete',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'MCxK0hzT9CPjJx1ZV5unfr',
            title: 'AI-Powered Customer'
                + ' Support Chatbot',
            position: 8,
            status: 'in-review',

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
            readiness: 'ready',

            risks: jsonArrayField([
                {
                    title:
                        'AI response accuracy',
                    severity: 'high',
                    mitigation:
                        'Implement human'
                        + ' escalation for'
                        + ' low-confidence'
                        + ' responses and'
                        + ' continuous training'
                        + ' loop',
                },
                {
                    title:
                        'Integration complexity',
                    severity: 'medium',
                    mitigation:
                        'Phase rollout'
                        + ' starting with'
                        + ' FAQ-only queries'
                        + ' before expanding'
                        + ' scope',
                },
                {
                    title:
                        'Customer acceptance',
                    severity: 'low',
                    mitigation:
                        'Clear bot'
                        + ' identification and'
                        + ' easy handoff to'
                        + ' human agents',
                },
            ]),
            assumptions: jsonArrayField([
                'Current helpdesk API'
                    + ' supports required'
                    + ' integrations',
                'Historical ticket data is'
                    + ' clean and'
                    + ' categorizable',
                'Legal has approved AI'
                    + ' usage for customer'
                    + ' interactions',
            ]),
            alignments: jsonArrayField([
                'Q1 OKR: Improve customer'
                    + ' satisfaction score'
                    + ' by 15%',
                'Digital transformation'
                    + ' initiative',
                'Cost optimization'
                    + ' program',
            ]),
        },
        {
            id: 'SUb4gKXsZ1OsEauzqszg0t',
            title: 'Mobile App Push'
                + ' Notification Revamp',
            position: 10,
            status: 'in-review',

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
            readiness: 'needs-info',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'gxa84W9KvEgD0wT1F4TOM9',
            title: 'Sustainability Dashboard'
                + ' for Operations',
            position: 9,
            status: 'in-review',

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
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: '1Z68gROMrlTAfPEGiyJJAY',
            title: 'Employee Wellness'
                + ' Program Integration',
            position: 11,
            status: 'in-review',

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
            readiness: 'incomplete',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
        },
        {
            id: 'Q2On2xwMpFdzOklBQJXrni',
            title: 'Real-time Inventory'
                + ' Tracking System',
            position: 7,
            status: 'in-review',

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
            readiness: 'ready',

            risks: jsonArrayField([]),
            assumptions: jsonArrayField([]),
            alignments: jsonArrayField([]),
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
            projects_current: 12,
            ideas_limit: TIER_IDEAS_LIMIT,
            ideas_current: 47,
            storage_limit: TIER_STORAGE_GB,
            storage_current: 2.4,
            ai_credits_limit: TIER_AI_CREDITS,
            ai_credits_current: 850,
            health_score: 92,
            health_status: 'excellent',
            last_activity: dt(0, 16, 0),
            active_people: 14,
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
            status: 'approved',
            progress: 67,
            start_date: dt(60, 9, 0),
            target_end_date: dt(-30, 9, 0),
            estimated_duration:
                160 * SECONDS_PER_HOUR,
            actual_duration:
                92 * SECONDS_PER_HOUR,
            estimated_cost: 88000,
            actual_cost: 51000,
            estimated_impact: 88,
            actual_impact: 0,
            position: 1,
            business_context: jsonObjectField({
                problem:
                    'Manual segmentation'
                    + ' takes two weeks and'
                    + ' is stale by the time'
                    + ' it ships.',
                expectedOutcome:
                    'Real-time segments'
                    + ' that update'
                    + ' automatically and'
                    + ' lift conversion 40%.',
                successMetrics: [
                    'Segmentation time:'
                        + ' weeks to seconds',
                    'Conversion rate +40%',
                    'Customer LTV +25%',
                ],
                constraints: [
                    'Salesforce CRM'
                        + ' integration',
                    'GDPR compliance for EU',
                    'Phase 1 capped at $90k',
                ],
            }),
            timeline_label: 'On Track',
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
            status: 'completed',
            progress: 100,
            start_date: dt(110, 9, 0),
            target_end_date: dt(45, 9, 0),
            estimated_duration:
                80 * SECONDS_PER_HOUR,
            actual_duration:
                75 * SECONDS_PER_HOUR,
            estimated_cost: 56000,
            actual_cost: 58000,
            estimated_impact: 72,
            actual_impact: 78,
            position: 2,
            business_context: jsonObjectField({}),
            timeline_label: 'Completed',
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
            status: 'approved',
            progress: 69,
            start_date: dt(55, 9, 0),
            target_end_date: dt(-25, 9, 0),
            estimated_duration:
                144 * SECONDS_PER_HOUR,
            actual_duration:
                88 * SECONDS_PER_HOUR,
            estimated_cost: 78000,
            actual_cost: 48000,
            estimated_impact: 91,
            actual_impact: 0,
            position: 3,
            business_context: jsonObjectField({
                problem:
                    'Leads sit untriaged'
                    + ' for days; mid-funnel'
                    + ' drops are'
                    + ' unattributed.',
                expectedOutcome:
                    'AI-assisted triage'
                    + ' cuts time-to-'
                    + 'discovery by 80% and'
                    + ' surfaces every'
                    + ' stalled deal.',
                successMetrics: [
                    'Triage SLA < 4 hours',
                    'Win rate +12 points',
                    'Qualified pipeline +35%',
                ],
                constraints: [
                    'Salesforce integration',
                    'AI worker auth tokens'
                        + ' rotated quarterly',
                ],
            }),
            timeline_label: 'On Track',
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
            status: 'under-review',
            progress: 17,
            start_date: dt(18, 9, 0),
            target_end_date: dt(-90, 9, 0),
            estimated_duration:
                220 * SECONDS_PER_HOUR,
            actual_duration:
                12 * SECONDS_PER_HOUR,
            estimated_cost: 110000,
            actual_cost: 7000,
            estimated_impact: 84,
            actual_impact: 0,
            position: 4,
            business_context: jsonObjectField({}),
            timeline_label: 'Just Started',
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
            status: 'completed',
            progress: 100,
            start_date: dt(95, 9, 0),
            target_end_date: dt(40, 9, 0),
            estimated_duration:
                64 * SECONDS_PER_HOUR,
            actual_duration:
                70 * SECONDS_PER_HOUR,
            estimated_cost: 50000,
            actual_cost: 52000,
            estimated_impact: 76,
            actual_impact: 81,
            position: 5,
            business_context: jsonObjectField({}),
            timeline_label: 'Completed',
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
            status: 'sent-back',
            progress: 76,
            start_date: dt(38, 9, 0),
            target_end_date: dt(-12, 9, 0),
            estimated_duration:
                96 * SECONDS_PER_HOUR,
            actual_duration:
                28 * SECONDS_PER_HOUR,
            estimated_cost: 64000,
            actual_cost: 84000,
            estimated_impact: 67,
            actual_impact: 0,
            position: 6,
            business_context: jsonObjectField({}),
            timeline_label: 'Over Budget',
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
            status: 'under-review',
            progress: 10,
            start_date: dt(12, 9, 0),
            target_end_date: dt(-110, 9, 0),
            estimated_duration:
                96 * SECONDS_PER_HOUR,
            actual_duration:
                6 * SECONDS_PER_HOUR,
            estimated_cost: 60000,
            actual_cost: 3500,
            estimated_impact: 65,
            actual_impact: 0,
            position: 7,
            business_context: jsonObjectField({}),
            timeline_label: 'Just Started',
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
            status: 'approved',
            progress: 69,
            start_date: dt(48, 9, 0),
            target_end_date: dt(-22, 9, 0),
            estimated_duration:
                110 * SECONDS_PER_HOUR,
            actual_duration:
                65 * SECONDS_PER_HOUR,
            estimated_cost: 64000,
            actual_cost: 42000,
            estimated_impact: 73,
            actual_impact: 0,
            position: 8,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
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
            status: 'approved',
            progress: 86,
            start_date: dt(72, 9, 0),
            target_end_date: dt(-12, 9, 0),
            estimated_duration:
                180 * SECONDS_PER_HOUR,
            actual_duration:
                122 * SECONDS_PER_HOUR,
            estimated_cost: 102000,
            actual_cost: 142000,
            estimated_impact: 81,
            actual_impact: 0,
            position: 9,
            business_context: jsonObjectField({}),
            timeline_label: 'Over Budget',
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
            status: 'approved',
            progress: 91,
            start_date: dt(82, 9, 0),
            target_end_date: dt(-8, 9, 0),
            estimated_duration:
                240 * SECONDS_PER_HOUR,
            actual_duration:
                168 * SECONDS_PER_HOUR,
            estimated_cost: 134000,
            actual_cost: 99000,
            estimated_impact: 93,
            actual_impact: 0,
            position: 10,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
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
            status: 'approved',
            progress: 53,
            start_date: dt(40, 9, 0),
            target_end_date: dt(-35, 9, 0),
            estimated_duration:
                132 * SECONDS_PER_HOUR,
            actual_duration:
                58 * SECONDS_PER_HOUR,
            estimated_cost: 76000,
            actual_cost: 36000,
            estimated_impact: 68,
            actual_impact: 0,
            position: 11,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
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
            status: 'completed',
            progress: 100,
            start_date: dt(120, 9, 0),
            target_end_date: dt(35, 9, 0),
            estimated_duration:
                100 * SECONDS_PER_HOUR,
            actual_duration:
                90 * SECONDS_PER_HOUR,
            estimated_cost: 62000,
            actual_cost: 56000,
            estimated_impact: 70,
            actual_impact: 73,
            position: 12,
            business_context: jsonObjectField({}),
            timeline_label: 'Completed',
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
            status: 'under-review',
            progress: 17,
            start_date: dt(22, 9, 0),
            target_end_date: dt(-105, 9, 0),
            estimated_duration:
                160 * SECONDS_PER_HOUR,
            actual_duration:
                14 * SECONDS_PER_HOUR,
            estimated_cost: 90000,
            actual_cost: 8500,
            estimated_impact: 79,
            actual_impact: 0,
            position: 13,
            business_context: jsonObjectField({}),
            timeline_label: 'Just Started',
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
            status: 'approved',
            progress: 78,
            start_date: dt(65, 9, 0),
            target_end_date: dt(-18, 9, 0),
            estimated_duration:
                120 * SECONDS_PER_HOUR,
            actual_duration:
                78 * SECONDS_PER_HOUR,
            estimated_cost: 70000,
            actual_cost: 45000,
            estimated_impact: 71,
            actual_impact: 0,
            position: 14,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
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
            status: 'approved',
            progress: 67,
            start_date: dt(58, 9, 0),
            target_end_date: dt(-28, 9, 0),
            estimated_duration:
                100 * SECONDS_PER_HOUR,
            actual_duration:
                60 * SECONDS_PER_HOUR,
            estimated_cost: 56000,
            actual_cost: 34000,
            estimated_impact: 66,
            actual_impact: 0,
            position: 15,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
        },
    ];

    const activities: ActivityEntity[] = [
        {
            id: '5PGE1WlEOTkSaNYjiBXLMA',
            type: 'idea_created',
            action: 'submitted new idea',
            target: 'Mobile App Redesign',
            timestamp: dt(0, 17, 0),
            status: 'active',
            feedback:
                'Addresses top user'
                + ' feedback themes.',
        },
        {
            id: 'fOqTfg9JPs73xsnC4QUmHs',
            type: 'comment_added',
            action: 'commented on',
            target:
                'Q1 Analytics Dashboard',
            timestamp: dt(0, 16, 0),
            status: 'active',
            feedback:
                'Great progress on the'
                + ' charts!',
        },
        {
            id: '3pBQbQp4LPK2udgd21HlTm',
            type: 'user_joined',
            action: 'joined the team',
            target: 'Product Innovation',
            timestamp: dt(0, 15, 0),
            status: 'active',
            feedback:
                'Excited to contribute'
                + ' to the team.',
        },
        {
            id: 'CqXHcyiDNzFVcoUM2M1Tl3',
            type: 'status_changed',
            action: 'changed status of',
            target:
                'Customer Feedback Portal',
            timestamp: dt(0, 14, 0),
            status: 'In Progress',
            feedback:
                'Development sprint'
                + ' started this week.',
        },
        {
            id: 'Kj75MtFxnEpFZs4MSK1emd',
            type: 'idea_converted',
            action:
                'converted idea to project',
            target: 'Automated Testing'
                + ' Framework',
            timestamp: dt(0, 13, 0),
            status: 'completed',
            feedback:
                'Approved by engineering'
                + ' leadership.',
        },
        {
            id: 'xRmfZFNV8GYDQmq8j09Fsc',
            type: 'project_created',
            action: 'created new project',
            target: 'Performance'
                + ' Optimization Initiative',
            timestamp: dt(0, 12, 0),
            status: 'active',
            feedback:
                'Targeting 40% latency'
                + ' reduction.',
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
    const workerClaude = 'model_claude_sonnet';

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
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
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
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
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
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
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
            created_at: wfTimestamp,
            updated_at: wfTimestamp,
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
            created_at: woCreated,
        },
        // ── happy-path runs (WO02-WO23) ──────────
        // Create → Data Capture → Review → Archive.
        // Sojourn in Data Capture varies 1–9 days
        // with a fat right tail so Data Capture is
        // the hot node in heat stats.
        {
            id: 'wo02Kd3pL8nXvQyRmJ5sT7',
            display_id: 'b2d4f6a8',
            flow_graph: woGraph(),
            position: 2,
            created_at: dt(88, 9, 0),
        },
        {
            id: 'wo03Zn7gH2cWqFpBsYtE4X',
            display_id: 'c3e5g7b9',
            flow_graph: woGraph(),
            position: 3,
            created_at: dt(82, 10, 0),
        },
        {
            id: 'wo04Af5xM9dRkVoNhUwG1J',
            display_id: 'd4f6h8c0',
            flow_graph: woGraph(),
            position: 4,
            created_at: dt(76, 8, 30),
        },
        {
            id: 'wo05Bq8tP3yLsZnCgXdI6K',
            display_id: 'e5g7i9d1',
            flow_graph: woGraph(),
            position: 5,
            created_at: dt(71, 9, 0),
        },
        {
            id: 'wo06Cr1uQ4zMtAoHewJ7L',
            display_id: 'f6h8j0e2',
            flow_graph: woGraph(),
            position: 6,
            created_at: dt(66, 11, 0),
        },
        {
            id: 'wo07Ds2vR5aNuBpIfxK8M',
            display_id: 'g7i9k1f3',
            flow_graph: woGraph(),
            position: 7,
            created_at: dt(61, 9, 30),
        },
        {
            id: 'wo08Et3wS6bOvCqJgyL9N',
            display_id: 'h8j0l2g4',
            flow_graph: woGraph(),
            position: 8,
            created_at: dt(57, 8, 0),
        },
        {
            id: 'wo09Fu4xT7cPwDrKhzM0O',
            display_id: 'i9k1m3h5',
            flow_graph: woGraph(),
            position: 9,
            created_at: dt(52, 10, 0),
        },
        {
            id: 'wo10Gv5yU8dQxEsLinA1P',
            display_id: 'j0l2n4i6',
            flow_graph: woGraph(),
            position: 10,
            created_at: dt(48, 9, 0),
        },
        {
            id: 'wo11Hw6zV9eRyFtMjoB2Q',
            display_id: 'k1m3o5j7',
            flow_graph: woGraph(),
            position: 11,
            created_at: dt(44, 10, 30),
        },
        {
            id: 'wo12Ix7aW0fSzGuNkpC3R',
            display_id: 'l2n4p6k8',
            flow_graph: woGraph(),
            position: 12,
            created_at: dt(40, 9, 0),
        },
        {
            id: 'wo13Jy8bX1gTaHvOlqD4S',
            display_id: 'm3o5q7l9',
            flow_graph: woGraph(),
            position: 13,
            created_at: dt(37, 8, 0),
        },
        {
            id: 'wo14Kz9cY2hUbIwPmrE5T',
            display_id: 'n4p6r8m0',
            flow_graph: woGraph(),
            position: 14,
            created_at: dt(33, 9, 30),
        },
        {
            id: 'wo15La0dZ3iVcJxQnsF6U',
            display_id: 'o5q7s9n1',
            flow_graph: woGraph(),
            position: 15,
            created_at: dt(29, 10, 0),
        },
        {
            id: 'wo16Mb1eA4jWdKyRotG7V',
            display_id: 'p6r8t0o2',
            flow_graph: woGraph(),
            position: 16,
            created_at: dt(26, 9, 0),
        },
        {
            id: 'wo17Nc2fB5kXeLzSpuH8W',
            display_id: 'q7s9u1p3',
            flow_graph: woGraph(),
            position: 17,
            created_at: dt(23, 8, 30),
        },
        {
            id: 'wo18Od3gC6lYfMaTqvI9X',
            display_id: 'r8t0v2q4',
            flow_graph: woGraph(),
            position: 18,
            created_at: dt(20, 10, 0),
        },
        {
            id: 'wo19Pe4hD7mZgNbUrwJ0Y',
            display_id: 's9u1w3r5',
            flow_graph: woGraph(),
            position: 19,
            created_at: dt(17, 9, 0),
        },
        {
            id: 'wo20Qf5iE8nAhOcVsxK1Z',
            display_id: 't0v2x4s6',
            flow_graph: woGraph(),
            position: 20,
            created_at: dt(14, 8, 0),
        },
        {
            id: 'wo21Rg6jF9oBiPdWtyL2A',
            display_id: 'u1w3y5t7',
            flow_graph: woGraph(),
            position: 21,
            created_at: dt(11, 10, 30),
        },
        {
            id: 'wo22Sh7kG0pCjQeXuzM3B',
            display_id: 'v2x4z6u8',
            flow_graph: woGraph(),
            position: 22,
            created_at: dt(9, 9, 0),
        },
        {
            id: 'wo23Ti8lH1qDkRfYvaN4C',
            display_id: 'w3y5a7v9',
            flow_graph: woGraph(),
            position: 23,
            created_at: dt(6, 11, 0),
        },
        // ── needs-revision loops (WO24-WO29) ─────
        // … → Data Capture → Review → Data Capture
        // → Review → Archive. Exercises revisit
        // rate and the Review→Capture branch split.
        {
            id: 'wo24Uj9mI2rElSgZwbO5D',
            display_id: 'x4z6b8w0',
            flow_graph: woGraph(),
            position: 24,
            created_at: dt(77, 9, 0),
        },
        {
            id: 'wo25Vk0nJ3sFmThaXcP6E',
            display_id: 'y5a7c9x1',
            flow_graph: woGraph(),
            position: 25,
            created_at: dt(63, 10, 0),
        },
        {
            id: 'wo26Wl1oK4tGnUibYdQ7F',
            display_id: 'z6b8d0y2',
            flow_graph: woGraph(),
            position: 26,
            created_at: dt(50, 8, 30),
        },
        {
            id: 'wo27Xm2pL5uHoVjcZeR8G',
            display_id: 'a7c9e1z3',
            flow_graph: woGraph(),
            position: 27,
            created_at: dt(38, 9, 0),
        },
        {
            id: 'wo28Yn3qM6vIpWkdAfS9H',
            display_id: 'b8d0f2a4',
            flow_graph: woGraph(),
            position: 28,
            created_at: dt(25, 10, 0),
        },
        {
            id: 'wo29Zo4rN7wJqXleBgT0I',
            display_id: 'c9e1g3b5',
            flow_graph: woGraph(),
            position: 29,
            created_at: dt(12, 9, 30),
        },
        // in-flight runs (WO30-WO34):
        // Last transition lands in Data Capture or
        // Review with no Archive; exercises WIP and
        // incompleteWorkOrderCount.
        {
            id: 'wo30Ap5sO8xKrYmfChU1J',
            display_id: 'd0f2h4c6',
            flow_graph: woGraph(),
            position: 30,
            created_at: dt(18, 9, 0),
        },
        {
            id: 'wo31Bq6tP9yLsZngDiV2K',
            display_id: 'e1g3i5d7',
            flow_graph: woGraph(),
            position: 31,
            created_at: dt(10, 10, 0),
        },
        {
            id: 'wo32Cr7uQ0zMtAohEjW3L',
            display_id: 'f2h4j6e8',
            flow_graph: woGraph(),
            position: 32,
            created_at: dt(7, 8, 0),
        },
        {
            id: 'wo33Ds8vR1aNuBpiGkX4M',
            display_id: 'g3i5k7f9',
            flow_graph: woGraph(),
            position: 33,
            created_at: dt(4, 9, 0),
        },
        {
            id: 'wo34Et9wS2bOvCqjHlY5N',
            display_id: 'h4j6l8g0',
            flow_graph: woGraph(),
            position: 34,
            created_at: dt(2, 11, 0),
        },
        // ── out-of-clan runs (WO35-WO36) ─────────
        // OUT-transition from Data Capture is by
        // Sarah or Mike — neither is among that
        // node's workers, so topProducer.inCurrentClan
        // is false.
        {
            id: 'wo35Fu0xT3cPwDrkImZ6O',
            display_id: 'i5k7m9h1',
            flow_graph: woGraph(),
            position: 35,
            created_at: dt(35, 9, 0),
        },
        {
            id: 'wo36Gv1yU4dQxEslJnA7P',
            display_id: 'j6l8n0i2',
            flow_graph: woGraph(),
            position: 36,
            created_at: dt(22, 10, 30),
        },
        // old runs (WO37-WO38):
        // Created ~105 days ago, outside the
        // trailing-90-day stats window — so heat
        // values for their node visits are clipped.
        {
            id: 'wo37Hw2zV5eRyFtKjoB8Q',
            display_id: 'k7m9o1j3',
            flow_graph: woGraph(),
            position: 37,
            created_at: dt(108, 9, 0),
        },
        {
            id: 'wo38Ix3aW6fSzGuNkpC9R',
            display_id: 'l8n0p2k4',
            flow_graph: woGraph(),
            position: 38,
            created_at: dt(103, 10, 0),
        },
        // Proposal Review Cycle (prc01-prc06):
        // second flow demo -- 4 happy-path, 1
        // revisit, 1 in-flight.
        {
            id: 'prc01AaBbCcDdEeFfGgHhIi',
            display_id: 'prc01aabb',
            flow_graph: prcGraph(),
            position: 39,
            created_at: dt(60, 9, 0),
        },
        {
            id: 'prc02JjKkLlMmNnOoPpQqRr',
            display_id: 'prc02jjkk',
            flow_graph: prcGraph(),
            position: 40,
            created_at: dt(45, 10, 0),
        },
        {
            id: 'prc03SsTtUuVvWwXxYyZz00',
            display_id: 'prc03sstt',
            flow_graph: prcGraph(),
            position: 41,
            created_at: dt(30, 8, 0),
        },
        {
            id: 'prc04A1B2C3D4E5F6G7H8I9',
            display_id: 'prc04a1b2',
            flow_graph: prcGraph(),
            position: 42,
            created_at: dt(20, 11, 0),
        },
        // prc05: revisit -- Decision sends back
        // to Revise then Draft before completing.
        {
            id: 'prc05J1K2L3M4N5O6P7Q8R9',
            display_id: 'prc05j1k2',
            flow_graph: prcGraph(),
            position: 43,
            created_at: dt(15, 9, 0),
        },
        // prc06: in-flight -- stuck at Decision.
        {
            id: 'prc06S1T2U3V4W5X6Y7Z800',
            display_id: 'prc06s1t2',
            flow_graph: prcGraph(),
            position: 44,
            created_at: dt(5, 10, 0),
        },
    ];

    const mockFlowWorkOrders:
        FlowWorkOrderEntity[] = [
        {
            id: 'fwo-' + woId,
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id: woId,
            created_at: woCreated,
        },
        // happy-path
        {
            id: 'fwo-wo02Kd3pL8nXvQyRmJ5sT7',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo02Kd3pL8nXvQyRmJ5sT7',
            created_at: dt(88, 9, 0),
        },
        {
            id: 'fwo-wo03Zn7gH2cWqFpBsYtE4X',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo03Zn7gH2cWqFpBsYtE4X',
            created_at: dt(82, 10, 0),
        },
        {
            id: 'fwo-wo04Af5xM9dRkVoNhUwG1J',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo04Af5xM9dRkVoNhUwG1J',
            created_at: dt(76, 8, 30),
        },
        {
            id: 'fwo-wo05Bq8tP3yLsZnCgXdI6K',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo05Bq8tP3yLsZnCgXdI6K',
            created_at: dt(71, 9, 0),
        },
        {
            id: 'fwo-wo06Cr1uQ4zMtAoHewJ7L',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo06Cr1uQ4zMtAoHewJ7L',
            created_at: dt(66, 11, 0),
        },
        {
            id: 'fwo-wo07Ds2vR5aNuBpIfxK8M',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo07Ds2vR5aNuBpIfxK8M',
            created_at: dt(61, 9, 30),
        },
        {
            id: 'fwo-wo08Et3wS6bOvCqJgyL9N',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo08Et3wS6bOvCqJgyL9N',
            created_at: dt(57, 8, 0),
        },
        {
            id: 'fwo-wo09Fu4xT7cPwDrKhzM0O',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo09Fu4xT7cPwDrKhzM0O',
            created_at: dt(52, 10, 0),
        },
        {
            id: 'fwo-wo10Gv5yU8dQxEsLinA1P',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo10Gv5yU8dQxEsLinA1P',
            created_at: dt(48, 9, 0),
        },
        {
            id: 'fwo-wo11Hw6zV9eRyFtMjoB2Q',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo11Hw6zV9eRyFtMjoB2Q',
            created_at: dt(44, 10, 30),
        },
        {
            id: 'fwo-wo12Ix7aW0fSzGuNkpC3R',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo12Ix7aW0fSzGuNkpC3R',
            created_at: dt(40, 9, 0),
        },
        {
            id: 'fwo-wo13Jy8bX1gTaHvOlqD4S',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo13Jy8bX1gTaHvOlqD4S',
            created_at: dt(37, 8, 0),
        },
        {
            id: 'fwo-wo14Kz9cY2hUbIwPmrE5T',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo14Kz9cY2hUbIwPmrE5T',
            created_at: dt(33, 9, 30),
        },
        {
            id: 'fwo-wo15La0dZ3iVcJxQnsF6U',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo15La0dZ3iVcJxQnsF6U',
            created_at: dt(29, 10, 0),
        },
        {
            id: 'fwo-wo16Mb1eA4jWdKyRotG7V',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo16Mb1eA4jWdKyRotG7V',
            created_at: dt(26, 9, 0),
        },
        {
            id: 'fwo-wo17Nc2fB5kXeLzSpuH8W',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo17Nc2fB5kXeLzSpuH8W',
            created_at: dt(23, 8, 30),
        },
        {
            id: 'fwo-wo18Od3gC6lYfMaTqvI9X',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo18Od3gC6lYfMaTqvI9X',
            created_at: dt(20, 10, 0),
        },
        {
            id: 'fwo-wo19Pe4hD7mZgNbUrwJ0Y',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo19Pe4hD7mZgNbUrwJ0Y',
            created_at: dt(17, 9, 0),
        },
        {
            id: 'fwo-wo20Qf5iE8nAhOcVsxK1Z',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo20Qf5iE8nAhOcVsxK1Z',
            created_at: dt(14, 8, 0),
        },
        {
            id: 'fwo-wo21Rg6jF9oBiPdWtyL2A',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo21Rg6jF9oBiPdWtyL2A',
            created_at: dt(11, 10, 30),
        },
        {
            id: 'fwo-wo22Sh7kG0pCjQeXuzM3B',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo22Sh7kG0pCjQeXuzM3B',
            created_at: dt(9, 9, 0),
        },
        {
            id: 'fwo-wo23Ti8lH1qDkRfYvaN4C',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo23Ti8lH1qDkRfYvaN4C',
            created_at: dt(6, 11, 0),
        },
        // needs-revision
        {
            id: 'fwo-wo24Uj9mI2rElSgZwbO5D',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            created_at: dt(77, 9, 0),
        },
        {
            id: 'fwo-wo25Vk0nJ3sFmThaXcP6E',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo25Vk0nJ3sFmThaXcP6E',
            created_at: dt(63, 10, 0),
        },
        {
            id: 'fwo-wo26Wl1oK4tGnUibYdQ7F',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo26Wl1oK4tGnUibYdQ7F',
            created_at: dt(50, 8, 30),
        },
        {
            id: 'fwo-wo27Xm2pL5uHoVjcZeR8G',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo27Xm2pL5uHoVjcZeR8G',
            created_at: dt(38, 9, 0),
        },
        {
            id: 'fwo-wo28Yn3qM6vIpWkdAfS9H',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo28Yn3qM6vIpWkdAfS9H',
            created_at: dt(25, 10, 0),
        },
        {
            id: 'fwo-wo29Zo4rN7wJqXleBgT0I',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo29Zo4rN7wJqXleBgT0I',
            created_at: dt(12, 9, 30),
        },
        // in-flight
        {
            id: 'fwo-wo30Ap5sO8xKrYmfChU1J',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo30Ap5sO8xKrYmfChU1J',
            created_at: dt(18, 9, 0),
        },
        {
            id: 'fwo-wo31Bq6tP9yLsZngDiV2K',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo31Bq6tP9yLsZngDiV2K',
            created_at: dt(10, 10, 0),
        },
        {
            id: 'fwo-wo32Cr7uQ0zMtAohEjW3L',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo32Cr7uQ0zMtAohEjW3L',
            created_at: dt(7, 8, 0),
        },
        {
            id: 'fwo-wo33Ds8vR1aNuBpiGkX4M',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo33Ds8vR1aNuBpiGkX4M',
            created_at: dt(4, 9, 0),
        },
        {
            id: 'fwo-wo34Et9wS2bOvCqjHlY5N',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo34Et9wS2bOvCqjHlY5N',
            created_at: dt(2, 11, 0),
        },
        // out-of-clan
        {
            id: 'fwo-wo35Fu0xT3cPwDrkImZ6O',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo35Fu0xT3cPwDrkImZ6O',
            created_at: dt(35, 9, 0),
        },
        {
            id: 'fwo-wo36Gv1yU4dQxEslJnA7P',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo36Gv1yU4dQxEslJnA7P',
            created_at: dt(22, 10, 30),
        },
        // old (outside 90-day window)
        {
            id: 'fwo-wo37Hw2zV5eRyFtKjoB8Q',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo37Hw2zV5eRyFtKjoB8Q',
            created_at: dt(108, 9, 0),
        },
        {
            id: 'fwo-wo38Ix3aW6fSzGuNkpC9R',
            flow_id:
                'h5mErVBQhwdMKwi1co30jB',
            work_order_id:
                'wo38Ix3aW6fSzGuNkpC9R',
            created_at: dt(103, 10, 0),
        },
        // prc join rows (Proposal Review Cycle)
        {
            id: 'fwo-prc01AaBbCcDdEeFfGgHhIi',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            created_at: dt(60, 9, 0),
        },
        {
            id: 'fwo-prc02JjKkLlMmNnOoPpQqRr',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            created_at: dt(45, 10, 0),
        },
        {
            id: 'fwo-prc03SsTtUuVvWwXxYyZz00',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            created_at: dt(30, 8, 0),
        },
        {
            id: 'fwo-prc04A1B2C3D4E5F6G7H8I9',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            created_at: dt(20, 11, 0),
        },
        {
            id: 'fwo-prc05J1K2L3M4N5O6P7Q8R9',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            created_at: dt(15, 9, 0),
        },
        {
            id: 'fwo-prc06S1T2U3V4W5X6Y7Z800',
            flow_id:
                '7COt7Kf4OaOBg6AjaNO04s',
            work_order_id:
                'prc06S1T2U3V4W5X6Y7Z800',
            created_at: dt(5, 10, 0),
        },
    ];

    const mockWoTransitions:
        WorkOrderTransitionEntity[] = [
        {
            id: 'wot-01-' + woId,
            work_order_id: woId,
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at:
                woCreated,
        },
        {
            id: 'wot-02-' + woId,
            work_order_id: woId,
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at:
                woCreated,
        },
        {
            id: 'wot-03-' + woId,
            work_order_id: woId,
            from_node_id:
                woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMike,
            transitioned_at:
                dt(13, 14, 30),
        },
        {
            id: 'wot-04-' + woId,
            work_order_id: woId,
            from_node_id:
                woNodeReview,
            to_node_id:
                woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at:
                dt(12, 9, 15),
        },
        // happy-path WO02: DC sojourn 1 day
        {
            id: 'wot02-1-wo02Kd3pL8nXvQyRmJ5sT7',
            work_order_id:
                'wo02Kd3pL8nXvQyRmJ5sT7',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(88, 9, 0),
        },
        {
            id: 'wot02-2-wo02Kd3pL8nXvQyRmJ5sT7',
            work_order_id:
                'wo02Kd3pL8nXvQyRmJ5sT7',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(88, 9, 5),
        },
        {
            id: 'wot02-3-wo02Kd3pL8nXvQyRmJ5sT7',
            work_order_id:
                'wo02Kd3pL8nXvQyRmJ5sT7',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(87, 10, 0),
        },
        {
            id: 'wot02-4-wo02Kd3pL8nXvQyRmJ5sT7',
            work_order_id:
                'wo02Kd3pL8nXvQyRmJ5sT7',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(85, 14, 0),
        },
        // happy-path WO03: DC sojourn 2 days
        {
            id: 'wot03-1-wo03Zn7gH2cWqFpBsYtE4X',
            work_order_id:
                'wo03Zn7gH2cWqFpBsYtE4X',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(82, 10, 0),
        },
        {
            id: 'wot03-2-wo03Zn7gH2cWqFpBsYtE4X',
            work_order_id:
                'wo03Zn7gH2cWqFpBsYtE4X',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(82, 10, 8),
        },
        {
            id: 'wot03-3-wo03Zn7gH2cWqFpBsYtE4X',
            work_order_id:
                'wo03Zn7gH2cWqFpBsYtE4X',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(80, 11, 0),
        },
        {
            id: 'wot03-4-wo03Zn7gH2cWqFpBsYtE4X',
            work_order_id:
                'wo03Zn7gH2cWqFpBsYtE4X',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(79, 9, 0),
        },
        // happy-path WO04: DC sojourn 3 days
        {
            id: 'wot04-1-wo04Af5xM9dRkVoNhUwG1J',
            work_order_id:
                'wo04Af5xM9dRkVoNhUwG1J',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(76, 8, 30),
        },
        {
            id: 'wot04-2-wo04Af5xM9dRkVoNhUwG1J',
            work_order_id:
                'wo04Af5xM9dRkVoNhUwG1J',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(76, 8, 40),
        },
        {
            id: 'wot04-3-wo04Af5xM9dRkVoNhUwG1J',
            work_order_id:
                'wo04Af5xM9dRkVoNhUwG1J',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(73, 10, 0),
        },
        {
            id: 'wot04-4-wo04Af5xM9dRkVoNhUwG1J',
            work_order_id:
                'wo04Af5xM9dRkVoNhUwG1J',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(71, 15, 0),
        },
        // happy-path WO05: DC sojourn 1 day
        {
            id: 'wot05-1-wo05Bq8tP3yLsZnCgXdI6K',
            work_order_id:
                'wo05Bq8tP3yLsZnCgXdI6K',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(71, 9, 0),
        },
        {
            id: 'wot05-2-wo05Bq8tP3yLsZnCgXdI6K',
            work_order_id:
                'wo05Bq8tP3yLsZnCgXdI6K',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(71, 9, 10),
        },
        {
            id: 'wot05-3-wo05Bq8tP3yLsZnCgXdI6K',
            work_order_id:
                'wo05Bq8tP3yLsZnCgXdI6K',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(70, 14, 0),
        },
        {
            id: 'wot05-4-wo05Bq8tP3yLsZnCgXdI6K',
            work_order_id:
                'wo05Bq8tP3yLsZnCgXdI6K',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(68, 10, 0),
        },
        // happy-path WO06: DC sojourn 5 days
        {
            id: 'wot06-1-wo06Cr1uQ4zMtAoHewJ7L',
            work_order_id:
                'wo06Cr1uQ4zMtAoHewJ7L',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(66, 11, 0),
        },
        {
            id: 'wot06-2-wo06Cr1uQ4zMtAoHewJ7L',
            work_order_id:
                'wo06Cr1uQ4zMtAoHewJ7L',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(66, 11, 12),
        },
        {
            id: 'wot06-3-wo06Cr1uQ4zMtAoHewJ7L',
            work_order_id:
                'wo06Cr1uQ4zMtAoHewJ7L',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(61, 9, 0),
        },
        {
            id: 'wot06-4-wo06Cr1uQ4zMtAoHewJ7L',
            work_order_id:
                'wo06Cr1uQ4zMtAoHewJ7L',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(59, 14, 0),
        },
        // happy-path WO07: DC sojourn 2 days
        {
            id: 'wot07-1-wo07Ds2vR5aNuBpIfxK8M',
            work_order_id:
                'wo07Ds2vR5aNuBpIfxK8M',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(61, 9, 30),
        },
        {
            id: 'wot07-2-wo07Ds2vR5aNuBpIfxK8M',
            work_order_id:
                'wo07Ds2vR5aNuBpIfxK8M',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(61, 9, 45),
        },
        {
            id: 'wot07-3-wo07Ds2vR5aNuBpIfxK8M',
            work_order_id:
                'wo07Ds2vR5aNuBpIfxK8M',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(59, 11, 0),
        },
        {
            id: 'wot07-4-wo07Ds2vR5aNuBpIfxK8M',
            work_order_id:
                'wo07Ds2vR5aNuBpIfxK8M',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(58, 9, 0),
        },
        // happy-path WO08: DC sojourn 4 days
        {
            id: 'wot08-1-wo08Et3wS6bOvCqJgyL9N',
            work_order_id:
                'wo08Et3wS6bOvCqJgyL9N',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(57, 8, 0),
        },
        {
            id: 'wot08-2-wo08Et3wS6bOvCqJgyL9N',
            work_order_id:
                'wo08Et3wS6bOvCqJgyL9N',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(57, 8, 15),
        },
        {
            id: 'wot08-3-wo08Et3wS6bOvCqJgyL9N',
            work_order_id:
                'wo08Et3wS6bOvCqJgyL9N',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(53, 10, 0),
        },
        {
            id: 'wot08-4-wo08Et3wS6bOvCqJgyL9N',
            work_order_id:
                'wo08Et3wS6bOvCqJgyL9N',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(51, 14, 0),
        },
        // happy-path WO09: DC sojourn 7 days (fat tail)
        {
            id: 'wot09-1-wo09Fu4xT7cPwDrKhzM0O',
            work_order_id:
                'wo09Fu4xT7cPwDrKhzM0O',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(52, 10, 0),
        },
        {
            id: 'wot09-2-wo09Fu4xT7cPwDrKhzM0O',
            work_order_id:
                'wo09Fu4xT7cPwDrKhzM0O',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(52, 10, 20),
        },
        {
            id: 'wot09-3-wo09Fu4xT7cPwDrKhzM0O',
            work_order_id:
                'wo09Fu4xT7cPwDrKhzM0O',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(45, 9, 0),
        },
        {
            id: 'wot09-4-wo09Fu4xT7cPwDrKhzM0O',
            work_order_id:
                'wo09Fu4xT7cPwDrKhzM0O',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(43, 11, 0),
        },
        // happy-path WO10: DC sojourn 3 days
        {
            id: 'wot10-1-wo10Gv5yU8dQxEsLinA1P',
            work_order_id:
                'wo10Gv5yU8dQxEsLinA1P',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(48, 9, 0),
        },
        {
            id: 'wot10-2-wo10Gv5yU8dQxEsLinA1P',
            work_order_id:
                'wo10Gv5yU8dQxEsLinA1P',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(48, 9, 10),
        },
        {
            id: 'wot10-3-wo10Gv5yU8dQxEsLinA1P',
            work_order_id:
                'wo10Gv5yU8dQxEsLinA1P',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(45, 14, 0),
        },
        {
            id: 'wot10-4-wo10Gv5yU8dQxEsLinA1P',
            work_order_id:
                'wo10Gv5yU8dQxEsLinA1P',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(43, 10, 0),
        },
        // happy-path WO11: DC sojourn 2 days
        {
            id: 'wot11-1-wo11Hw6zV9eRyFtMjoB2Q',
            work_order_id:
                'wo11Hw6zV9eRyFtMjoB2Q',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(44, 10, 30),
        },
        {
            id: 'wot11-2-wo11Hw6zV9eRyFtMjoB2Q',
            work_order_id:
                'wo11Hw6zV9eRyFtMjoB2Q',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(44, 10, 45),
        },
        {
            id: 'wot11-3-wo11Hw6zV9eRyFtMjoB2Q',
            work_order_id:
                'wo11Hw6zV9eRyFtMjoB2Q',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(42, 11, 0),
        },
        {
            id: 'wot11-4-wo11Hw6zV9eRyFtMjoB2Q',
            work_order_id:
                'wo11Hw6zV9eRyFtMjoB2Q',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(41, 14, 0),
        },
        // happy-path WO12: DC sojourn 6 days (fat tail)
        {
            id: 'wot12-1-wo12Ix7aW0fSzGuNkpC3R',
            work_order_id:
                'wo12Ix7aW0fSzGuNkpC3R',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(40, 9, 0),
        },
        {
            id: 'wot12-2-wo12Ix7aW0fSzGuNkpC3R',
            work_order_id:
                'wo12Ix7aW0fSzGuNkpC3R',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(40, 9, 15),
        },
        {
            id: 'wot12-3-wo12Ix7aW0fSzGuNkpC3R',
            work_order_id:
                'wo12Ix7aW0fSzGuNkpC3R',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(34, 10, 0),
        },
        {
            id: 'wot12-4-wo12Ix7aW0fSzGuNkpC3R',
            work_order_id:
                'wo12Ix7aW0fSzGuNkpC3R',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(32, 9, 0),
        },
        // happy-path WO13: DC sojourn 1 day
        {
            id: 'wot13-1-wo13Jy8bX1gTaHvOlqD4S',
            work_order_id:
                'wo13Jy8bX1gTaHvOlqD4S',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(37, 8, 0),
        },
        {
            id: 'wot13-2-wo13Jy8bX1gTaHvOlqD4S',
            work_order_id:
                'wo13Jy8bX1gTaHvOlqD4S',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(37, 8, 10),
        },
        {
            id: 'wot13-3-wo13Jy8bX1gTaHvOlqD4S',
            work_order_id:
                'wo13Jy8bX1gTaHvOlqD4S',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(36, 11, 0),
        },
        {
            id: 'wot13-4-wo13Jy8bX1gTaHvOlqD4S',
            work_order_id:
                'wo13Jy8bX1gTaHvOlqD4S',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(35, 14, 0),
        },
        // happy-path WO14: DC sojourn 9 days (fat tail)
        {
            id: 'wot14-1-wo14Kz9cY2hUbIwPmrE5T',
            work_order_id:
                'wo14Kz9cY2hUbIwPmrE5T',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(33, 9, 30),
        },
        {
            id: 'wot14-2-wo14Kz9cY2hUbIwPmrE5T',
            work_order_id:
                'wo14Kz9cY2hUbIwPmrE5T',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(33, 9, 45),
        },
        {
            id: 'wot14-3-wo14Kz9cY2hUbIwPmrE5T',
            work_order_id:
                'wo14Kz9cY2hUbIwPmrE5T',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(24, 10, 0),
        },
        {
            id: 'wot14-4-wo14Kz9cY2hUbIwPmrE5T',
            work_order_id:
                'wo14Kz9cY2hUbIwPmrE5T',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(22, 9, 0),
        },
        // happy-path WO15: DC sojourn 2 days
        {
            id: 'wot15-1-wo15La0dZ3iVcJxQnsF6U',
            work_order_id:
                'wo15La0dZ3iVcJxQnsF6U',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(29, 10, 0),
        },
        {
            id: 'wot15-2-wo15La0dZ3iVcJxQnsF6U',
            work_order_id:
                'wo15La0dZ3iVcJxQnsF6U',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(29, 10, 15),
        },
        {
            id: 'wot15-3-wo15La0dZ3iVcJxQnsF6U',
            work_order_id:
                'wo15La0dZ3iVcJxQnsF6U',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(27, 14, 0),
        },
        {
            id: 'wot15-4-wo15La0dZ3iVcJxQnsF6U',
            work_order_id:
                'wo15La0dZ3iVcJxQnsF6U',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(25, 10, 0),
        },
        // happy-path WO16: DC sojourn 3 days
        {
            id: 'wot16-1-wo16Mb1eA4jWdKyRotG7V',
            work_order_id:
                'wo16Mb1eA4jWdKyRotG7V',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(26, 9, 0),
        },
        {
            id: 'wot16-2-wo16Mb1eA4jWdKyRotG7V',
            work_order_id:
                'wo16Mb1eA4jWdKyRotG7V',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(26, 9, 12),
        },
        {
            id: 'wot16-3-wo16Mb1eA4jWdKyRotG7V',
            work_order_id:
                'wo16Mb1eA4jWdKyRotG7V',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(23, 11, 0),
        },
        {
            id: 'wot16-4-wo16Mb1eA4jWdKyRotG7V',
            work_order_id:
                'wo16Mb1eA4jWdKyRotG7V',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(21, 14, 0),
        },
        // happy-path WO17: DC sojourn 1 day
        {
            id: 'wot17-1-wo17Nc2fB5kXeLzSpuH8W',
            work_order_id:
                'wo17Nc2fB5kXeLzSpuH8W',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(23, 8, 30),
        },
        {
            id: 'wot17-2-wo17Nc2fB5kXeLzSpuH8W',
            work_order_id:
                'wo17Nc2fB5kXeLzSpuH8W',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(23, 8, 42),
        },
        {
            id: 'wot17-3-wo17Nc2fB5kXeLzSpuH8W',
            work_order_id:
                'wo17Nc2fB5kXeLzSpuH8W',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(22, 10, 0),
        },
        {
            id: 'wot17-4-wo17Nc2fB5kXeLzSpuH8W',
            work_order_id:
                'wo17Nc2fB5kXeLzSpuH8W',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(21, 9, 0),
        },
        // happy-path WO18: DC sojourn 4 days
        {
            id: 'wot18-1-wo18Od3gC6lYfMaTqvI9X',
            work_order_id:
                'wo18Od3gC6lYfMaTqvI9X',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(20, 10, 0),
        },
        {
            id: 'wot18-2-wo18Od3gC6lYfMaTqvI9X',
            work_order_id:
                'wo18Od3gC6lYfMaTqvI9X',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(20, 10, 18),
        },
        {
            id: 'wot18-3-wo18Od3gC6lYfMaTqvI9X',
            work_order_id:
                'wo18Od3gC6lYfMaTqvI9X',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(16, 9, 0),
        },
        {
            id: 'wot18-4-wo18Od3gC6lYfMaTqvI9X',
            work_order_id:
                'wo18Od3gC6lYfMaTqvI9X',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(14, 14, 0),
        },
        // happy-path WO19: DC sojourn 8 days (fat tail)
        {
            id: 'wot19-1-wo19Pe4hD7mZgNbUrwJ0Y',
            work_order_id:
                'wo19Pe4hD7mZgNbUrwJ0Y',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(17, 9, 0),
        },
        {
            id: 'wot19-2-wo19Pe4hD7mZgNbUrwJ0Y',
            work_order_id:
                'wo19Pe4hD7mZgNbUrwJ0Y',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(17, 9, 20),
        },
        {
            id: 'wot19-3-wo19Pe4hD7mZgNbUrwJ0Y',
            work_order_id:
                'wo19Pe4hD7mZgNbUrwJ0Y',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(9, 10, 0),
        },
        {
            id: 'wot19-4-wo19Pe4hD7mZgNbUrwJ0Y',
            work_order_id:
                'wo19Pe4hD7mZgNbUrwJ0Y',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(7, 14, 0),
        },
        // happy-path WO20: DC sojourn 2 days
        {
            id: 'wot20-1-wo20Qf5iE8nAhOcVsxK1Z',
            work_order_id:
                'wo20Qf5iE8nAhOcVsxK1Z',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(14, 8, 0),
        },
        {
            id: 'wot20-2-wo20Qf5iE8nAhOcVsxK1Z',
            work_order_id:
                'wo20Qf5iE8nAhOcVsxK1Z',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(14, 8, 15),
        },
        {
            id: 'wot20-3-wo20Qf5iE8nAhOcVsxK1Z',
            work_order_id:
                'wo20Qf5iE8nAhOcVsxK1Z',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(12, 11, 0),
        },
        {
            id: 'wot20-4-wo20Qf5iE8nAhOcVsxK1Z',
            work_order_id:
                'wo20Qf5iE8nAhOcVsxK1Z',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(10, 9, 0),
        },
        // happy-path WO21: DC sojourn 3 days
        {
            id: 'wot21-1-wo21Rg6jF9oBiPdWtyL2A',
            work_order_id:
                'wo21Rg6jF9oBiPdWtyL2A',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(11, 10, 30),
        },
        {
            id: 'wot21-2-wo21Rg6jF9oBiPdWtyL2A',
            work_order_id:
                'wo21Rg6jF9oBiPdWtyL2A',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(11, 10, 48),
        },
        {
            id: 'wot21-3-wo21Rg6jF9oBiPdWtyL2A',
            work_order_id:
                'wo21Rg6jF9oBiPdWtyL2A',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(8, 14, 0),
        },
        {
            id: 'wot21-4-wo21Rg6jF9oBiPdWtyL2A',
            work_order_id:
                'wo21Rg6jF9oBiPdWtyL2A',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(6, 10, 0),
        },
        // happy-path WO22: DC sojourn 1 day
        {
            id: 'wot22-1-wo22Sh7kG0pCjQeXuzM3B',
            work_order_id:
                'wo22Sh7kG0pCjQeXuzM3B',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(9, 9, 0),
        },
        {
            id: 'wot22-2-wo22Sh7kG0pCjQeXuzM3B',
            work_order_id:
                'wo22Sh7kG0pCjQeXuzM3B',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(9, 9, 10),
        },
        {
            id: 'wot22-3-wo22Sh7kG0pCjQeXuzM3B',
            work_order_id:
                'wo22Sh7kG0pCjQeXuzM3B',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(8, 10, 0),
        },
        {
            id: 'wot22-4-wo22Sh7kG0pCjQeXuzM3B',
            work_order_id:
                'wo22Sh7kG0pCjQeXuzM3B',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(7, 9, 0),
        },
        // happy-path WO23: DC sojourn 2 days
        {
            id: 'wot23-1-wo23Ti8lH1qDkRfYvaN4C',
            work_order_id:
                'wo23Ti8lH1qDkRfYvaN4C',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(6, 11, 0),
        },
        {
            id: 'wot23-2-wo23Ti8lH1qDkRfYvaN4C',
            work_order_id:
                'wo23Ti8lH1qDkRfYvaN4C',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(6, 11, 15),
        },
        {
            id: 'wot23-3-wo23Ti8lH1qDkRfYvaN4C',
            work_order_id:
                'wo23Ti8lH1qDkRfYvaN4C',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(4, 9, 0),
        },
        {
            id: 'wot23-4-wo23Ti8lH1qDkRfYvaN4C',
            work_order_id:
                'wo23Ti8lH1qDkRfYvaN4C',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(2, 14, 0),
        },
        // needs-revision WO24: double loop DC->Review->DC
        // twice, creating a 3rd distinct completed path
        {
            id: 'wot24-1-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(77, 9, 0),
        },
        {
            id: 'wot24-2-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(77, 9, 10),
        },
        {
            id: 'wot24-3-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(75, 11, 0),
        },
        {
            id: 'wot24-4-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: woNodeReview,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(74, 14, 0),
        },
        {
            id: 'wot24-5-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(73, 10, 0),
        },
        {
            id: 'wot24-6-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: woNodeReview,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(72, 14, 0),
        },
        {
            id: 'wot24-7-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(71, 10, 0),
        },
        {
            id: 'wot24-8-wo24Uj9mI2rElSgZwbO5D',
            work_order_id:
                'wo24Uj9mI2rElSgZwbO5D',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(70, 9, 0),
        },
        // needs-revision WO25: loops DC->Review->DC
        {
            id: 'wot25-1-wo25Vk0nJ3sFmThaXcP6E',
            work_order_id:
                'wo25Vk0nJ3sFmThaXcP6E',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(63, 10, 0),
        },
        {
            id: 'wot25-2-wo25Vk0nJ3sFmThaXcP6E',
            work_order_id:
                'wo25Vk0nJ3sFmThaXcP6E',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(63, 10, 15),
        },
        {
            id: 'wot25-3-wo25Vk0nJ3sFmThaXcP6E',
            work_order_id:
                'wo25Vk0nJ3sFmThaXcP6E',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(61, 14, 0),
        },
        {
            id: 'wot25-4-wo25Vk0nJ3sFmThaXcP6E',
            work_order_id:
                'wo25Vk0nJ3sFmThaXcP6E',
            from_node_id: woNodeReview,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(60, 22, 0),
        },
        {
            id: 'wot25-5-wo25Vk0nJ3sFmThaXcP6E',
            work_order_id:
                'wo25Vk0nJ3sFmThaXcP6E',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(59, 14, 0),
        },
        {
            id: 'wot25-6-wo25Vk0nJ3sFmThaXcP6E',
            work_order_id:
                'wo25Vk0nJ3sFmThaXcP6E',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(58, 9, 0),
        },
        // needs-revision WO26: loops DC->Review->DC
        {
            id: 'wot26-1-wo26Wl1oK4tGnUibYdQ7F',
            work_order_id:
                'wo26Wl1oK4tGnUibYdQ7F',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(50, 8, 30),
        },
        {
            id: 'wot26-2-wo26Wl1oK4tGnUibYdQ7F',
            work_order_id:
                'wo26Wl1oK4tGnUibYdQ7F',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(50, 8, 45),
        },
        {
            id: 'wot26-3-wo26Wl1oK4tGnUibYdQ7F',
            work_order_id:
                'wo26Wl1oK4tGnUibYdQ7F',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(48, 11, 0),
        },
        {
            id: 'wot26-4-wo26Wl1oK4tGnUibYdQ7F',
            work_order_id:
                'wo26Wl1oK4tGnUibYdQ7F',
            from_node_id: woNodeReview,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(47, 14, 0),
        },
        {
            id: 'wot26-5-wo26Wl1oK4tGnUibYdQ7F',
            work_order_id:
                'wo26Wl1oK4tGnUibYdQ7F',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(46, 10, 0),
        },
        {
            id: 'wot26-6-wo26Wl1oK4tGnUibYdQ7F',
            work_order_id:
                'wo26Wl1oK4tGnUibYdQ7F',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(44, 14, 0),
        },
        // needs-revision WO27: loops DC->Review->DC
        {
            id: 'wot27-1-wo27Xm2pL5uHoVjcZeR8G',
            work_order_id:
                'wo27Xm2pL5uHoVjcZeR8G',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(38, 9, 0),
        },
        {
            id: 'wot27-2-wo27Xm2pL5uHoVjcZeR8G',
            work_order_id:
                'wo27Xm2pL5uHoVjcZeR8G',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(38, 9, 18),
        },
        {
            id: 'wot27-3-wo27Xm2pL5uHoVjcZeR8G',
            work_order_id:
                'wo27Xm2pL5uHoVjcZeR8G',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(36, 14, 0),
        },
        {
            id: 'wot27-4-wo27Xm2pL5uHoVjcZeR8G',
            work_order_id:
                'wo27Xm2pL5uHoVjcZeR8G',
            from_node_id: woNodeReview,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(35, 22, 0),
        },
        {
            id: 'wot27-5-wo27Xm2pL5uHoVjcZeR8G',
            work_order_id:
                'wo27Xm2pL5uHoVjcZeR8G',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(34, 14, 0),
        },
        {
            id: 'wot27-6-wo27Xm2pL5uHoVjcZeR8G',
            work_order_id:
                'wo27Xm2pL5uHoVjcZeR8G',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(33, 9, 0),
        },
        // needs-revision WO28: loops DC->Review->DC
        {
            id: 'wot28-1-wo28Yn3qM6vIpWkdAfS9H',
            work_order_id:
                'wo28Yn3qM6vIpWkdAfS9H',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(25, 10, 0),
        },
        {
            id: 'wot28-2-wo28Yn3qM6vIpWkdAfS9H',
            work_order_id:
                'wo28Yn3qM6vIpWkdAfS9H',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(25, 10, 20),
        },
        {
            id: 'wot28-3-wo28Yn3qM6vIpWkdAfS9H',
            work_order_id:
                'wo28Yn3qM6vIpWkdAfS9H',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(23, 14, 0),
        },
        {
            id: 'wot28-4-wo28Yn3qM6vIpWkdAfS9H',
            work_order_id:
                'wo28Yn3qM6vIpWkdAfS9H',
            from_node_id: woNodeReview,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(22, 14, 0),
        },
        {
            id: 'wot28-5-wo28Yn3qM6vIpWkdAfS9H',
            work_order_id:
                'wo28Yn3qM6vIpWkdAfS9H',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(21, 10, 0),
        },
        {
            id: 'wot28-6-wo28Yn3qM6vIpWkdAfS9H',
            work_order_id:
                'wo28Yn3qM6vIpWkdAfS9H',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(19, 14, 0),
        },
        // needs-revision WO29: loops DC->Review->DC
        {
            id: 'wot29-1-wo29Zo4rN7wJqXleBgT0I',
            work_order_id:
                'wo29Zo4rN7wJqXleBgT0I',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(12, 9, 30),
        },
        {
            id: 'wot29-2-wo29Zo4rN7wJqXleBgT0I',
            work_order_id:
                'wo29Zo4rN7wJqXleBgT0I',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(12, 9, 45),
        },
        {
            id: 'wot29-3-wo29Zo4rN7wJqXleBgT0I',
            work_order_id:
                'wo29Zo4rN7wJqXleBgT0I',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(11, 11, 0),
        },
        {
            id: 'wot29-4-wo29Zo4rN7wJqXleBgT0I',
            work_order_id:
                'wo29Zo4rN7wJqXleBgT0I',
            from_node_id: woNodeReview,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(10, 14, 0),
        },
        {
            id: 'wot29-5-wo29Zo4rN7wJqXleBgT0I',
            work_order_id:
                'wo29Zo4rN7wJqXleBgT0I',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(9, 11, 0),
        },
        {
            id: 'wot29-6-wo29Zo4rN7wJqXleBgT0I',
            work_order_id:
                'wo29Zo4rN7wJqXleBgT0I',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(8, 9, 0),
        },
        // in-flight WO30: sitting in Data Capture
        {
            id: 'wot30-1-wo30Ap5sO8xKrYmfChU1J',
            work_order_id:
                'wo30Ap5sO8xKrYmfChU1J',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(18, 9, 0),
        },
        {
            id: 'wot30-2-wo30Ap5sO8xKrYmfChU1J',
            work_order_id:
                'wo30Ap5sO8xKrYmfChU1J',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(18, 9, 15),
        },
        // in-flight WO31: sitting in Data Capture
        {
            id: 'wot31-1-wo31Bq6tP9yLsZngDiV2K',
            work_order_id:
                'wo31Bq6tP9yLsZngDiV2K',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(10, 10, 0),
        },
        {
            id: 'wot31-2-wo31Bq6tP9yLsZngDiV2K',
            work_order_id:
                'wo31Bq6tP9yLsZngDiV2K',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(10, 10, 20),
        },
        // in-flight WO32: sitting in Data Capture
        {
            id: 'wot32-1-wo32Cr7uQ0zMtAohEjW3L',
            work_order_id:
                'wo32Cr7uQ0zMtAohEjW3L',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(7, 8, 0),
        },
        {
            id: 'wot32-2-wo32Cr7uQ0zMtAohEjW3L',
            work_order_id:
                'wo32Cr7uQ0zMtAohEjW3L',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(7, 8, 12),
        },
        // in-flight WO33: sitting in Review
        {
            id: 'wot33-1-wo33Ds8vR1aNuBpiGkX4M',
            work_order_id:
                'wo33Ds8vR1aNuBpiGkX4M',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(4, 9, 0),
        },
        {
            id: 'wot33-2-wo33Ds8vR1aNuBpiGkX4M',
            work_order_id:
                'wo33Ds8vR1aNuBpiGkX4M',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(4, 9, 18),
        },
        {
            id: 'wot33-3-wo33Ds8vR1aNuBpiGkX4M',
            work_order_id:
                'wo33Ds8vR1aNuBpiGkX4M',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(3, 14, 0),
        },
        // in-flight WO34: sitting in Review
        {
            id: 'wot34-1-wo34Et9wS2bOvCqjHlY5N',
            work_order_id:
                'wo34Et9wS2bOvCqjHlY5N',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(2, 11, 0),
        },
        {
            id: 'wot34-2-wo34Et9wS2bOvCqjHlY5N',
            work_order_id:
                'wo34Et9wS2bOvCqjHlY5N',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(2, 11, 20),
        },
        {
            id: 'wot34-3-wo34Et9wS2bOvCqjHlY5N',
            work_order_id:
                'wo34Et9wS2bOvCqjHlY5N',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonCurrent,
            transitioned_at: dt(1, 10, 0),
        },
        // out-of-clan WO35: Sarah (not in DC workers)
        // transitions DC out
        {
            id: 'wot35-1-wo35Fu0xT3cPwDrkImZ6O',
            work_order_id:
                'wo35Fu0xT3cPwDrkImZ6O',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(35, 9, 0),
        },
        {
            id: 'wot35-2-wo35Fu0xT3cPwDrkImZ6O',
            work_order_id:
                'wo35Fu0xT3cPwDrkImZ6O',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(35, 9, 12),
        },
        {
            id: 'wot35-3-wo35Fu0xT3cPwDrkImZ6O',
            work_order_id:
                'wo35Fu0xT3cPwDrkImZ6O',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonSarah,
            transitioned_at: dt(33, 10, 0),
        },
        {
            id: 'wot35-4-wo35Fu0xT3cPwDrkImZ6O',
            work_order_id:
                'wo35Fu0xT3cPwDrkImZ6O',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(31, 14, 0),
        },
        // out-of-clan WO36: Mike (not in DC workers)
        // transitions DC out
        {
            id: 'wot36-1-wo36Gv1yU4dQxEslJnA7P',
            work_order_id:
                'wo36Gv1yU4dQxEslJnA7P',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(22, 10, 30),
        },
        {
            id: 'wot36-2-wo36Gv1yU4dQxEslJnA7P',
            work_order_id:
                'wo36Gv1yU4dQxEslJnA7P',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(22, 10, 45),
        },
        {
            id: 'wot36-3-wo36Gv1yU4dQxEslJnA7P',
            work_order_id:
                'wo36Gv1yU4dQxEslJnA7P',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMike,
            transitioned_at: dt(20, 11, 0),
        },
        {
            id: 'wot36-4-wo36Gv1yU4dQxEslJnA7P',
            work_order_id:
                'wo36Gv1yU4dQxEslJnA7P',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(18, 14, 0),
        },
        // old WO37: straddles window edge; Create+DC
        // entry at dt(108) but DC exit at dt(8) so
        // only the in-window ~82 days of DC sojourn
        // count toward heat (exercises window clipping)
        {
            id: 'wot37-1-wo37Hw2zV5eRyFtKjoB8Q',
            work_order_id:
                'wo37Hw2zV5eRyFtKjoB8Q',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonMike,
            transitioned_at: dt(108, 9, 0),
        },
        {
            id: 'wot37-2-wo37Hw2zV5eRyFtKjoB8Q',
            work_order_id:
                'wo37Hw2zV5eRyFtKjoB8Q',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonMike,
            transitioned_at: dt(108, 9, 15),
        },
        {
            id: 'wot37-3-wo37Hw2zV5eRyFtKjoB8Q',
            work_order_id:
                'wo37Hw2zV5eRyFtKjoB8Q',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(8, 10, 0),
        },
        {
            id: 'wot37-4-wo37Hw2zV5eRyFtKjoB8Q',
            work_order_id:
                'wo37Hw2zV5eRyFtKjoB8Q',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonSarah,
            transitioned_at: dt(5, 14, 0),
        },
        // old WO38: all transitions ~100-103 days ago,
        // entirely outside the 90-day window; contributes
        // ~0 to heat stats
        {
            id: 'wot38-1-wo38Ix3aW6fSzGuNkpC9R',
            work_order_id:
                'wo38Ix3aW6fSzGuNkpC9R',
            from_node_id: '',
            to_node_id: woNodeNew,
            person_id: woPersonSarah,
            transitioned_at: dt(103, 10, 0),
        },
        {
            id: 'wot38-2-wo38Ix3aW6fSzGuNkpC9R',
            work_order_id:
                'wo38Ix3aW6fSzGuNkpC9R',
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            person_id: woPersonSarah,
            transitioned_at: dt(103, 10, 18),
        },
        {
            id: 'wot38-3-wo38Ix3aW6fSzGuNkpC9R',
            work_order_id:
                'wo38Ix3aW6fSzGuNkpC9R',
            from_node_id: woNodeCapture,
            to_node_id: woNodeReview,
            person_id: woPersonMarcus,
            transitioned_at: dt(101, 11, 0),
        },
        {
            id: 'wot38-4-wo38Ix3aW6fSzGuNkpC9R',
            work_order_id:
                'wo38Ix3aW6fSzGuNkpC9R',
            from_node_id: woNodeReview,
            to_node_id: woNodeComplete,
            person_id: woPersonMike,
            transitioned_at: dt(100, 9, 0),
        },
        // prc01: happy path, ~3 day draft sojourn
        {
            id: 'wprc01-1',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: '',
            to_node_id: prcNodeStart,
            person_id: woPersonSarah,
            transitioned_at: dt(60, 9, 0),
        },
        {
            id: 'wprc01-2',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: prcNodeStart,
            to_node_id: prcNodeDraft,
            person_id: woPersonSarah,
            transitioned_at: dt(60, 9, 5),
        },
        {
            id: 'wprc01-3',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: prcNodeDraft,
            to_node_id: prcNodeSubmit,
            person_id: woPersonMike,
            transitioned_at: dt(57, 10, 0),
        },
        {
            id: 'wprc01-4',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: prcNodeSubmit,
            to_node_id: prcNodeTriage,
            person_id: woPersonMike,
            transitioned_at: dt(57, 10, 30),
        },
        {
            id: 'wprc01-5',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: prcNodeTriage,
            to_node_id: prcNodeQuickRev,
            person_id: woPersonMarcus,
            transitioned_at: dt(57, 11, 0),
        },
        {
            id: 'wprc01-6',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: prcNodeQuickRev,
            to_node_id: prcNodeDecision,
            person_id: woPersonMarcus,
            transitioned_at: dt(56, 14, 0),
        },
        {
            id: 'wprc01-7',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: prcNodeDecision,
            to_node_id: prcNodeApproved,
            person_id: woPersonSarah,
            transitioned_at: dt(56, 15, 0),
        },
        {
            id: 'wprc01-8',
            work_order_id:
                'prc01AaBbCcDdEeFfGgHhIi',
            from_node_id: prcNodeApproved,
            to_node_id: prcNodeArchive,
            person_id: woPersonSarah,
            transitioned_at: dt(55, 9, 0),
        },
        // prc02: happy path, ~2 day draft sojourn
        {
            id: 'wprc02-1',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: '',
            to_node_id: prcNodeStart,
            person_id: woPersonMike,
            transitioned_at: dt(45, 10, 0),
        },
        {
            id: 'wprc02-2',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: prcNodeStart,
            to_node_id: prcNodeDraft,
            person_id: woPersonMike,
            transitioned_at: dt(45, 10, 10),
        },
        {
            id: 'wprc02-3',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: prcNodeDraft,
            to_node_id: prcNodeSubmit,
            person_id: woPersonMike,
            transitioned_at: dt(43, 9, 0),
        },
        {
            id: 'wprc02-4',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: prcNodeSubmit,
            to_node_id: prcNodeTriage,
            person_id: woPersonMarcus,
            transitioned_at: dt(43, 9, 20),
        },
        {
            id: 'wprc02-5',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: prcNodeTriage,
            to_node_id: prcNodeQuickRev,
            person_id: woPersonMarcus,
            transitioned_at: dt(43, 10, 0),
        },
        {
            id: 'wprc02-6',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: prcNodeQuickRev,
            to_node_id: prcNodeDecision,
            person_id: woPersonSarah,
            transitioned_at: dt(42, 14, 0),
        },
        {
            id: 'wprc02-7',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: prcNodeDecision,
            to_node_id: prcNodeApproved,
            person_id: woPersonSarah,
            transitioned_at: dt(42, 15, 0),
        },
        {
            id: 'wprc02-8',
            work_order_id:
                'prc02JjKkLlMmNnOoPpQqRr',
            from_node_id: prcNodeApproved,
            to_node_id: prcNodeArchive,
            person_id: woPersonMike,
            transitioned_at: dt(41, 10, 0),
        },
        // prc03: happy path, ~1 day draft sojourn
        {
            id: 'wprc03-1',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: '',
            to_node_id: prcNodeStart,
            person_id: woPersonSarah,
            transitioned_at: dt(30, 8, 0),
        },
        {
            id: 'wprc03-2',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: prcNodeStart,
            to_node_id: prcNodeDraft,
            person_id: woPersonSarah,
            transitioned_at: dt(30, 8, 10),
        },
        {
            id: 'wprc03-3',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: prcNodeDraft,
            to_node_id: prcNodeSubmit,
            person_id: woPersonCurrent,
            transitioned_at: dt(29, 9, 0),
        },
        {
            id: 'wprc03-4',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: prcNodeSubmit,
            to_node_id: prcNodeTriage,
            person_id: woPersonCurrent,
            transitioned_at: dt(29, 9, 15),
        },
        {
            id: 'wprc03-5',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: prcNodeTriage,
            to_node_id: prcNodeQuickRev,
            person_id: woPersonMarcus,
            transitioned_at: dt(29, 10, 0),
        },
        {
            id: 'wprc03-6',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: prcNodeQuickRev,
            to_node_id: prcNodeDecision,
            person_id: woPersonMarcus,
            transitioned_at: dt(28, 15, 0),
        },
        {
            id: 'wprc03-7',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: prcNodeDecision,
            to_node_id: prcNodeApproved,
            person_id: woPersonMike,
            transitioned_at: dt(28, 16, 0),
        },
        {
            id: 'wprc03-8',
            work_order_id:
                'prc03SsTtUuVvWwXxYyZz00',
            from_node_id: prcNodeApproved,
            to_node_id: prcNodeArchive,
            person_id: woPersonMike,
            transitioned_at: dt(27, 9, 0),
        },
        // prc04: happy path, ~4 day draft sojourn
        {
            id: 'wprc04-1',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: '',
            to_node_id: prcNodeStart,
            person_id: woPersonMike,
            transitioned_at: dt(20, 11, 0),
        },
        {
            id: 'wprc04-2',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: prcNodeStart,
            to_node_id: prcNodeDraft,
            person_id: woPersonMike,
            transitioned_at: dt(20, 11, 5),
        },
        {
            id: 'wprc04-3',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: prcNodeDraft,
            to_node_id: prcNodeSubmit,
            person_id: woPersonMarcus,
            transitioned_at: dt(16, 10, 0),
        },
        {
            id: 'wprc04-4',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: prcNodeSubmit,
            to_node_id: prcNodeTriage,
            person_id: woPersonSarah,
            transitioned_at: dt(16, 10, 20),
        },
        {
            id: 'wprc04-5',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: prcNodeTriage,
            to_node_id: prcNodeQuickRev,
            person_id: woPersonSarah,
            transitioned_at: dt(16, 11, 0),
        },
        {
            id: 'wprc04-6',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: prcNodeQuickRev,
            to_node_id: prcNodeDecision,
            person_id: woPersonSarah,
            transitioned_at: dt(15, 14, 0),
        },
        {
            id: 'wprc04-7',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: prcNodeDecision,
            to_node_id: prcNodeApproved,
            person_id: woPersonMike,
            transitioned_at: dt(15, 15, 30),
        },
        {
            id: 'wprc04-8',
            work_order_id:
                'prc04A1B2C3D4E5F6G7H8I9',
            from_node_id: prcNodeApproved,
            to_node_id: prcNodeArchive,
            person_id: woPersonMike,
            transitioned_at: dt(14, 9, 0),
        },
        // prc05: revisit -- Decision sends to
        // Revise, then Draft again, then completes
        {
            id: 'wprc05-1',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: '',
            to_node_id: prcNodeStart,
            person_id: woPersonSarah,
            transitioned_at: dt(15, 9, 0),
        },
        {
            id: 'wprc05-2',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeStart,
            to_node_id: prcNodeDraft,
            person_id: woPersonSarah,
            transitioned_at: dt(15, 9, 10),
        },
        {
            id: 'wprc05-3',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeDraft,
            to_node_id: prcNodeSubmit,
            person_id: woPersonMike,
            transitioned_at: dt(14, 10, 0),
        },
        {
            id: 'wprc05-4',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeSubmit,
            to_node_id: prcNodeTriage,
            person_id: woPersonMike,
            transitioned_at: dt(14, 10, 15),
        },
        {
            id: 'wprc05-5',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeTriage,
            to_node_id: prcNodeQuickRev,
            person_id: woPersonMarcus,
            transitioned_at: dt(14, 11, 0),
        },
        {
            id: 'wprc05-6',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeQuickRev,
            to_node_id: prcNodeDecision,
            person_id: woPersonMarcus,
            transitioned_at: dt(13, 14, 0),
        },
        // Decision routes to Revise (revisit)
        {
            id: 'wprc05-7',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeDecision,
            to_node_id: prcNodeRevise,
            person_id: woPersonCurrent,
            transitioned_at: dt(13, 15, 0),
        },
        // Revise sends back to Draft
        {
            id: 'wprc05-8',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeRevise,
            to_node_id: prcNodeDraft,
            person_id: woPersonSarah,
            transitioned_at: dt(12, 9, 0),
        },
        {
            id: 'wprc05-9',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeDraft,
            to_node_id: prcNodeSubmit,
            person_id: woPersonSarah,
            transitioned_at: dt(11, 10, 0),
        },
        {
            id: 'wprc05-10',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeSubmit,
            to_node_id: prcNodeTriage,
            person_id: woPersonMike,
            transitioned_at: dt(11, 10, 20),
        },
        {
            id: 'wprc05-11',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeTriage,
            to_node_id: prcNodeQuickRev,
            person_id: woPersonMike,
            transitioned_at: dt(11, 11, 0),
        },
        {
            id: 'wprc05-12',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeQuickRev,
            to_node_id: prcNodeDecision,
            person_id: woPersonMarcus,
            transitioned_at: dt(10, 14, 0),
        },
        {
            id: 'wprc05-13',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeDecision,
            to_node_id: prcNodeApproved,
            person_id: woPersonMarcus,
            transitioned_at: dt(10, 15, 0),
        },
        {
            id: 'wprc05-14',
            work_order_id:
                'prc05J1K2L3M4N5O6P7Q8R9',
            from_node_id: prcNodeApproved,
            to_node_id: prcNodeArchive,
            person_id: woPersonSarah,
            transitioned_at: dt(9, 9, 0),
        },
        // prc06: in-flight -- stuck at Decision
        {
            id: 'wprc06-1',
            work_order_id:
                'prc06S1T2U3V4W5X6Y7Z800',
            from_node_id: '',
            to_node_id: prcNodeStart,
            person_id: woPersonMike,
            transitioned_at: dt(5, 10, 0),
        },
        {
            id: 'wprc06-2',
            work_order_id:
                'prc06S1T2U3V4W5X6Y7Z800',
            from_node_id: prcNodeStart,
            to_node_id: prcNodeDraft,
            person_id: woPersonMike,
            transitioned_at: dt(5, 10, 8),
        },
        {
            id: 'wprc06-3',
            work_order_id:
                'prc06S1T2U3V4W5X6Y7Z800',
            from_node_id: prcNodeDraft,
            to_node_id: prcNodeSubmit,
            person_id: woPersonCurrent,
            transitioned_at: dt(4, 11, 0),
        },
        {
            id: 'wprc06-4',
            work_order_id:
                'prc06S1T2U3V4W5X6Y7Z800',
            from_node_id: prcNodeSubmit,
            to_node_id: prcNodeTriage,
            person_id: woPersonSarah,
            transitioned_at: dt(4, 11, 20),
        },
        {
            id: 'wprc06-5',
            work_order_id:
                'prc06S1T2U3V4W5X6Y7Z800',
            from_node_id: prcNodeTriage,
            to_node_id: prcNodeQuickRev,
            person_id: woPersonSarah,
            transitioned_at: dt(4, 12, 0),
        },
        {
            id: 'wprc06-6',
            work_order_id:
                'prc06S1T2U3V4W5X6Y7Z800',
            from_node_id: prcNodeQuickRev,
            to_node_id: prcNodeDecision,
            person_id: woPersonMarcus,
            transitioned_at: dt(3, 14, 0),
        },
        // stays at Decision -- no more transitions
    ];

    const mockTransitionFieldValues:
        TransitionFieldValueEntity[] = [
        {
            id: 'tfv-03-name-' + woId,
            transition_id: 'wot-03-' + woId,
            field_id: fCompanyName,
            value: 'Acme Corp',
        },
        {
            id: 'tfv-03-email-' + woId,
            transition_id: 'wot-03-' + woId,
            field_id: fEmail,
            value: 'onboard@acme.com',
        },
        {
            id: 'tfv-03-phone-' + woId,
            transition_id: 'wot-03-' + woId,
            field_id: fPhone,
            value: '+1-555-0100',
        },
        {
            id: 'tfv-03-ind-' + woId,
            transition_id: 'wot-03-' + woId,
            field_id: fIndustry,
            value: 'Technology',
        },
        {
            id: 'tfv-03-rev-' + woId,
            transition_id: 'wot-03-' + woId,
            field_id: fRevenue,
            value: '5000000',
        },
        {
            id: 'tfv-03-emp-' + woId,
            transition_id: 'wot-03-' + woId,
            field_id: fEmployees,
            value: '250',
        },
        {
            id: 'tfv-04-notes-' + woId,
            transition_id: 'wot-04-' + woId,
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
            created_at: wfTimestamp,
        },
        {
            id: '5ddqhtwd3qcdodXLcsDdyt',
            project_id: 'jRE2Tj32NHsFGZIeEADp0p',
            flow_id: 'E2BnBlZyrriqsQYkmS4usb',
            created_at: wfTimestamp,
        },
        {
            id: '9YX7ZU4br6zxrHyVcmRjJP',
            project_id: 'u6YkHhlGc91oDMkr3x0isa',
            flow_id: '7COt7Kf4OaOBg6AjaNO04s',
            created_at: wfTimestamp,
        },
        {
            id: l2cProjectFlowId,
            project_id: l2cProjectId,
            flow_id: l2cFlowId,
            created_at: wfTimestamp,
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
            idPrefix: 'lc',
            seed: 0xC0DEF00D,
        });

    await Promise.all([
        ...projects.map(project =>
            adapter.projects.put(
                project.id,
                project,
            ),
        ),
        ...activities.map(activity =>
            adapter.activities.put(
                activity.id,
                activity,
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
            person_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(75, 9, 30),
        },
        {
            id: 'XC7hsfNJueKQ8q0UfCuC7o',
            idea_id: 'cbTuSs0Ex84PeFGSvoAEFZ',
            person_id: 'bLP3X1hb1mSz8gY9neogU3',
            created_at: dt(70, 9, 0),
        },
        {
            id: 'YmzT46BbGVFALpiXFDnlVd',
            idea_id: 'wuCMQqo4IkEksx7MYmu8g2',
            person_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(65, 9, 0),
        },
        {
            id: 'cmoTu4GRGmO8y5QrfPIHSm',
            idea_id: 'ojOEXtdzdtTZtpM81TxVca',
            person_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            created_at: dt(55, 9, 0),
        },
        {
            id: 'kIUtvgTOLPjsSmAEVOhPb1',
            idea_id: 'T2vAafLDcshDONlYxpzPLc',
            person_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            created_at: dt(50, 9, 0),
        },
        {
            id: 'r04u9qpJKSyNjP9Owxr5Be',
            idea_id: 'HRYrImq1rBJ5ZRe1T9TAVk',
            person_id: 'zyTbfbjcGEfbpCsNTP0XjX',
            created_at: dt(45, 9, 0),
        },
        {
            id: '2mPJTlujj1RF6gexFwbDqJ',
            idea_id: 'MCxK0hzT9CPjJx1ZV5unfr',
            person_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(75, 10, 0),
        },
        {
            id: 'caBSqTgzDnvP8joamAG9OG',
            idea_id: 'SUb4gKXsZ1OsEauzqszg0t',
            person_id: 'WxQn4LVWb76YkmqK5B0EPp',
            created_at: dt(35, 9, 0),
        },
        {
            id: 'UfsCp7WYUybhwxD170okb4',
            idea_id: 'gxa84W9KvEgD0wT1F4TOM9',
            person_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(30, 9, 0),
        },
        {
            id: 'mbTZAQbC5cJSEIzhEEFpyq',
            idea_id: '1Z68gROMrlTAfPEGiyJJAY',
            person_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            created_at: dt(25, 9, 0),
        },
        {
            id: '0LjTHFflWNaDZkKDqxmwJi',
            idea_id: 'Q2On2xwMpFdzOklBQJXrni',
            person_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            created_at: dt(20, 9, 0),
        },
    ];

    const activityActors:
        ActivityActorEntity[] = [
        {
            id: 'b46Mr8QWIMo4EDBxxhfkWL',
            activity_id: 'Ng6GWmx7DNmLsGshK3lBfU',
            person_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(0, 17, 50),
        },
        {
            id: 'pgyIzpoLgG8Vv6FgYF4DV8',
            activity_id: 'p3H9tGtQwFwQXpUiYyinT6',
            person_id: 'WxQn4LVWb76YkmqK5B0EPp',
            created_at: dt(0, 17, 35),
        },
        {
            id: 'SJalTSor6JhpoPincDXLeY',
            activity_id: '5PGE1WlEOTkSaNYjiBXLMA',
            person_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(0, 17, 0),
        },
        {
            id: 'JvodSYYA6w1ithWEirfNVg',
            activity_id: 'fOqTfg9JPs73xsnC4QUmHs',
            person_id: '6xBfK5If82JKfThXb1wlzS',
            created_at: dt(0, 16, 0),
        },
        {
            id: 'BExIeH5NDiGVGQnrP8phOs',
            activity_id: '3pBQbQp4LPK2udgd21HlTm',
            person_id: 'I5ntELi16X3N3JYCCnxMjZ',
            created_at: dt(0, 15, 0),
        },
        {
            id: 'pC3hoLmzaVyxJSGOHsmV5j',
            activity_id: 'CqXHcyiDNzFVcoUM2M1Tl3',
            person_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            created_at: dt(0, 14, 0),
        },
        {
            id: 'PsG42X7oevXgC5DRy4irTW',
            activity_id: 'Kj75MtFxnEpFZs4MSK1emd',
            person_id: 'oU0bIe0eUC33mTbZrxdogC',
            created_at: dt(0, 13, 0),
        },
        {
            id: 'bPgxi8YCw4yTFctLef62gB',
            activity_id: 'xRmfZFNV8GYDQmq8j09Fsc',
            person_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(0, 12, 0),
        },
        {
            id: '2dp7FPj4gjWYtfR78D3wI2',
            activity_id: 'hP80lUSXqn1PSleymgE3Ks',
            person_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(1, 18, 0),
        },
        {
            id: 'Rf5G2Dh1ejnvzxbpW6hcrm',
            activity_id: 'XMltAG0dpolQLDTfd5GLWj',
            person_id: 'WxQn4LVWb76YkmqK5B0EPp',
            created_at: dt(1, 15, 0),
        },
    ];

    const aiWorkers: AIWorkerEntity[] = [
        {
            id: 'model_claude_opus',
            name: 'Claude Opus 4.7 Max',
            provider: 'Anthropic',
            description:
                'Anthropic flagship — long'
                + ' context, deep reasoning.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
            created_at: dt(0, 11, 0),
        },
        {
            id: 'model_claude_sonnet',
            name: 'Claude Sonnet 4.6',
            provider: 'Anthropic',
            description:
                'Anthropic mid-tier — fast'
                + ' and capable.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
            created_at: dt(0, 11, 0),
        },
        {
            id: 'model_gpt_5_4_pro',
            name: 'GPT-5.4 Pro',
            provider: 'OpenAI',
            description:
                'OpenAI multimodal flagship.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
            created_at: dt(0, 11, 0),
        },
        {
            id: 'model_grok_heavy',
            name: 'Grok 4.20 Heavy',
            provider: 'xAI',
            description:
                'xAI heavy-compute model.',
            auth_token:
                'sk-PLACEHOLDER-DEMOTOKEN-XXXX',
            created_at: dt(0, 11, 0),
        },
    ];

    await Promise.all([
        ...ideaSubmissions.map(r =>
            adapter.ideaSubmissions.put(
                r.id, r,
            ),
        ),
        ...activityActors.map(r =>
            adapter.activityActors.put(
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
        ...mockWoTransitions.map(r =>
            adapter.workOrderTransitions
                .put(r.id, r),
        ),
        ...mockTransitionFieldValues.map(r =>
            adapter.transitionFieldValues
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
        ...leadToCloseData.transitions.map(r =>
            adapter.workOrderTransitions
                .put(r.id, r),
        ),
    ]);
}

export async function populateBootstrapData(
    adapter: DbAdapter,
): Promise<void> {
    await Promise.all([
        adapter.workers.put('current', {
            first_name: 'Tony',
            last_name: 'Stark',
            email: 'demo@example.com',
            title: 'Admin',
            department: 'Product',
            status: 'active' as WorkerStatus,
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
        adapter.organization.put({
            name: 'Stark Industries',
            domain: 'acmecorp.com',
            plan: 'Business',
            plan_status: 'active',
            next_billing: dt(-300, 0, 0),
            seats: 25,
            used_seats: 18,
            projects_limit: TIER_PROJECTS_LIMIT,
            projects_current: 12,
            ideas_limit: TIER_IDEAS_LIMIT,
            ideas_current: 47,
            storage_limit: TIER_STORAGE_GB,
            storage_current: 2.4,
            ai_credits_limit: TIER_AI_CREDITS,
            ai_credits_current: 850,
            health_score: 92,
            health_status: 'excellent',
            last_activity: dt(0, 16, 0),
            active_people: 14,
        }),
    ]);
}
