import type { DbAdapter } from './db.ts';
import type {
    UserEntity,
    UserStatus,
    ReadinessLevel,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    FlowEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    TransitionFieldValueEntity,
} from './types.ts';
import {
    jsonArrayField,
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
    SECONDS_PER_HOUR,
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

type SeedUser = Omit<
    UserEntity,
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
    const users: SeedUser[] = [
        {
            id: 'LhfaUUf4IumVsCSGB4xjdK',
            first_name: 'Sarah',
            last_name: 'Chen',
            email: 'sarah.chen@company.com',
            role: 'Project Lead',
            department: 'Operations',
            status: 'active',
            availability: 85,
            performance_score: 94,
            projects_completed: 12,
            current_projects: 3,
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
            last_active: dt(0, 16, 0),
        },
        {
            id: 'bLP3X1hb1mSz8gY9neogU3',
            first_name: 'Mike',
            last_name: 'Thompson',
            email: 'mike.thompson@company.com',
            role: 'ML Engineer',
            department: 'Engineering',
            status: 'active',
            availability: 60,
            performance_score: 91,
            projects_completed: 8,
            current_projects: 2,
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
            last_active: dt(1, 15, 30),
        },
        {
            id: 'zyTbfbjcGEfbpCsNTP0XjX',
            first_name: 'Jessica',
            last_name: 'Park',
            email: 'jessica.park@company.com',
            role: 'Data Scientist',
            department: 'Analytics',
            status: 'active',
            availability: 70,
            performance_score: 88,
            projects_completed: 6,
            current_projects: 2,
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
            last_active: dt(0, 17, 0),
        },
        {
            id: '6xBfK5If82JKfThXb1wlzS',
            first_name: 'David',
            last_name: 'Martinez',
            email: 'david.martinez@company.com',
            role: 'Backend Developer',
            department: 'Engineering',
            status: 'active',
            availability: 40,
            performance_score: 86,
            projects_completed: 10,
            current_projects: 4,
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
            last_active: dt(0, 14, 0),
        },
        {
            id: '53J8h9dr76XFqCjYcNVwIR',
            first_name: 'Emily',
            last_name: 'Rodriguez',
            email: 'emily.rodriguez@company.com',
            role: 'UX Designer',
            department: 'Design',
            status: 'pending',
            availability: 90,
            performance_score: 92,
            projects_completed: 15,
            current_projects: 1,
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
            last_active: dt(0, 9, 15),
        },
        {
            id: 'I5ntELi16X3N3JYCCnxMjZ',
            first_name: 'Alex',
            last_name: 'Kim',
            email: 'alex.kim@company.com',
            role: 'Product Manager',
            department: 'Product',
            status: 'active',
            availability: 55,
            performance_score: 89,
            projects_completed: 7,
            current_projects: 3,
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
            last_active: dt(0, 11, 45),
        },
        {
            id: 'WxQn4LVWb76YkmqK5B0EPp',
            first_name: 'Marcus',
            last_name: 'Johnson',
            email: 'marcus@acmecorp.com',
            role: 'manager',
            department: 'Product',
            status: 'active',
            availability: 80,
            performance_score: 85,
            projects_completed: 5,
            current_projects: 2,
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
            last_active: dt(0, 17, 30),
        },
        {
            id: 'jBoWiyWxj7pp4sG3JgX5l2',
            first_name: 'David',
            last_name: 'Kim',
            email: 'david.kim@company.com',
            role: 'member',
            department: 'Engineering',
            status: 'active',
            availability: 75,
            performance_score: 83,
            projects_completed: 4,
            current_projects: 2,
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
            last_active: dt(2, 14, 0),
        },
        {
            id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            first_name: 'Lisa',
            last_name: 'Wang',
            email: 'lisa@acmecorp.com',
            role: 'viewer',
            department: 'Sales',
            status: 'active',
            availability: 70,
            performance_score: 80,
            projects_completed: 3,
            current_projects: 1,
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
            last_active: dt(1, 18, 0),
        },
        {
            id: 'oU0bIe0eUC33mTbZrxdogC',
            first_name: 'James',
            last_name: 'Miller',
            email: 'james@acmecorp.com',
            role: 'member',
            department: 'Engineering',
            status: 'deactivated',
            availability: 0,
            performance_score: 78,
            projects_completed: 6,
            current_projects: 0,
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
            last_active: dt(7, 18, 0),
        },
        {
            id: 'current',
            first_name: 'Tony',
            last_name: 'Stark',
            email: 'demo@example.com',
            role: 'Admin',
            department: 'Product',
            status: 'active',
            availability: 100,
            performance_score: 95,
            projects_completed: 20,
            current_projects: 5,
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
            last_active: dt(0, 18, 0),
        },
    ];

    await Promise.all(users.map(user =>
        adapter.users.put(user.id, {
            ...user,
            strengths:
                jsonArrayField(user.strengths),
            team_dimensions:
                jsonObjectField(
                    user.team_dimensions,
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
        adapter.company.put({
            name: 'Stark Industries',
            domain: 'acmecorp.com',
        }),
        adapter.organization.put({
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
            active_users: 14,
        }),
    ]);

    const projects: ProjectEntity[] = [
        {
            id: 'u6YkHhlGc91oDMkr3x0isa',
            title: 'AI-Powered Customer'
                + ' Segmentation',
            description:
                'Implement machine learning'
                + ' model to automatically'
                + ' segment customers based'
                + ' on behavior, purchase'
                + ' history, and engagement'
                + ' patterns.',
            status: 'approved',
            progress: 72,
            start_date: dt(60, 0, 0),
            target_end_date: dt(-30, 0, 0),
            estimated_duration: 120 * SECONDS_PER_HOUR,
            actual_duration: 85 * SECONDS_PER_HOUR,
            estimated_cost: 45000,
            actual_cost: 38000,
            estimated_impact: 85,
            actual_impact: 78,
            position: 1,
            business_context: jsonObjectField({
                problem:
                    'Current manual'
                    + ' segmentation takes 2'
                    + ' weeks and is often'
                    + ' outdated by the time'
                    + " it's complete."
                    + ' Marketing campaigns'
                    + ' suffer from poor'
                    + ' targeting.',
                expectedOutcome:
                    'Real-time customer'
                    + ' segments that update'
                    + ' automatically,'
                    + ' enabling personalized'
                    + ' marketing with 40%'
                    + ' better conversion'
                    + ' rates.',
                successMetrics: [
                    'Reduce segmentation'
                        + ' time from 2 weeks'
                        + ' to real-time',
                    'Improve campaign'
                        + ' conversion rates'
                        + ' by 40%',
                    'Increase customer'
                        + ' lifetime value'
                        + ' by 25%',
                ],
                constraints: [
                    'Must integrate with'
                        + ' existing CRM'
                        + ' (Salesforce)',
                    'GDPR compliance'
                        + ' required for EU'
                        + ' customers',
                    'Budget capped at'
                        + ' $50,000 for'
                        + ' Phase 1',
                ],
            }),
            timeline_label: '3-4 months',
            budget_label: '$45,000',
        },
        {
            id: 'jRE2Tj32NHsFGZIeEADp0p',
            title: 'Automated Report'
                + ' Generation',
            description:
                'Build an automated'
                + ' pipeline that aggregates'
                + ' multiple data sources'
                + ' and generates formatted'
                + ' reports on a schedule.',
            status: 'completed',
            progress: 100,
            start_date: dt(90, 9, 0),
            target_end_date: dt(57, 9, 0),
            estimated_duration: 80 * SECONDS_PER_HOUR,
            actual_duration: 60 * SECONDS_PER_HOUR,
            estimated_cost: 32000,
            actual_cost: 28000,
            estimated_impact: 78,
            actual_impact: 82,
            position: 2,
            business_context: jsonObjectField({}),
            timeline_label: 'Completed',
            budget_label: 'Under Budget',
        },
        {
            id: 'YXUxtljJj6ebsQEFZ5nSI1',
            title: 'Predictive Maintenance'
                + ' System',
            description:
                'Deploy IoT sensors with'
                + ' ML models to predict'
                + ' equipment failures'
                + ' before they occur,'
                + ' reducing unplanned'
                + ' downtime.',
            status: 'under-review',
            progress: 22,
            start_date: dt(45, 9, 0),
            target_end_date: dt(-28, 9, 0),
            estimated_duration: 200 * SECONDS_PER_HOUR,
            actual_duration: 45 * SECONDS_PER_HOUR,
            estimated_cost: 75000,
            actual_cost: 18000,
            estimated_impact: 90,
            actual_impact: 0,
            position: 3,
            business_context: jsonObjectField({}),
            timeline_label: 'At Risk',
            budget_label: 'Under Budget',
        },
        {
            id: 'sf1hZEIvey6seX1fbUwXMq',
            title: 'Real-time Analytics'
                + ' Dashboard',
            description:
                'Create a live dashboard'
                + ' with streaming data'
                + ' pipelines and automated'
                + ' anomaly alerts for'
                + ' leadership.',
            status: 'completed',
            progress: 100,
            start_date: dt(75, 9, 0),
            target_end_date: dt(47, 9, 0),
            estimated_duration: 60 * SECONDS_PER_HOUR,
            actual_duration: 55 * SECONDS_PER_HOUR,
            estimated_cost: 28000,
            actual_cost: 26000,
            estimated_impact: 72,
            actual_impact: 70,
            position: 4,
            business_context: jsonObjectField({}),
            timeline_label: 'Completed',
            budget_label: 'On Budget',
        },
        {
            id: 'efwJPwQFljYHZYMuhetyow',
            title: 'Smart Inventory'
                + ' Optimization',
            description:
                'Implement demand'
                + ' forecasting with'
                + ' automatic reorder'
                + ' triggers to reduce'
                + ' carrying costs and'
                + ' stockout incidents.',
            status: 'sent-back',
            progress: 15,
            start_date: dt(50, 9, 0),
            target_end_date: dt(7, 9, 0),
            estimated_duration: 100 * SECONDS_PER_HOUR,
            actual_duration: 30 * SECONDS_PER_HOUR,
            estimated_cost: 38000,
            actual_cost: 12000,
            estimated_impact: 68,
            actual_impact: 0,
            position: 5,
            business_context: jsonObjectField({}),
            timeline_label: 'Overdue',
            budget_label: 'Under Budget',
        },
        {
            id: 'zzcBNqWXtKs6kt7ggcRndY',
            title: 'Employee Training'
                + ' Assistant',
            description:
                'Build an AI training'
                + ' assistant that delivers'
                + ' personalized learning'
                + ' paths and answers'
                + ' procedural questions'
                + ' for new hires.',
            status: 'under-review',
            progress: 18,
            start_date: dt(14, 9, 0),
            target_end_date: dt(-28, 9, 0),
            estimated_duration: 90 * SECONDS_PER_HOUR,
            actual_duration: 20 * SECONDS_PER_HOUR,
            estimated_cost: 35000,
            actual_cost: 8000,
            estimated_impact: 65,
            actual_impact: 0,
            position: 6,
            business_context: jsonObjectField({}),
            timeline_label: 'On Track',
            budget_label: 'Under Budget',
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
                        name: 'Start',
                        description: '',
                        positionX: 40,
                        positionY: 30,
                        isStart: true,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'KoWNvvHG8d3TLAVN5nrWGX',
                        name:
                            'Data Capture',
                        description: '',
                        positionX: 260,
                        positionY: 140,
                        isStart: false,
                        isComplete: false,
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
                        isStart: false,
                        isComplete: false,
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
                        name: 'End',
                        description: '',
                        positionX: 680,
                        positionY: 370,
                        isStart: false,
                        isComplete: true,
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
                        name: 'Start',
                        description: '',
                        positionX: -702,
                        positionY: -236,
                        isStart: true,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'nKbwVydJZixw20nvP2XqfF',
                        name: 'End',
                        description: '',
                        positionX: 436,
                        positionY: 358,
                        isStart: false,
                        isComplete: true,
                        fields: [],
                    },
                    {
                        id: 'aTGimTZZDvMb7iD9GuUbSG',
                        name: 'Ideas',
                        description: '',
                        positionX: -406,
                        positionY: -234,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '6KXcks9x9Tl54iNGWQoXNN',
                        name:
                            'Describe problem',
                        description: '',
                        positionX: -82,
                        positionY: -230,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'HmpBNWHjANtDY4qtKZENOE',
                        name: 'Who Benefits',
                        description: '',
                        positionX: 187,
                        positionY: -232,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'q1OZ85FQGwEbtIbFQo8H5o',
                        name: 'Solution',
                        description: '',
                        positionX: 527,
                        positionY: -231,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'Yt5GGbxJqVG5Ws4NrGWzDD',
                        name: 'Outcome',
                        description: '',
                        positionX: 525,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'm3sZ3Jk4ketOK9M9GD6qS1',
                        name: 'Edit Idea',
                        description: '',
                        positionX: 189,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'D5DUyVr3Azc8zfbqgMovTr',
                        name: 'Cost',
                        description: '',
                        positionX: -409,
                        positionY: 22,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '1TKczWqL7gndPvMGFxYWGI',
                        name: 'Impact',
                        description: '',
                        positionX: -411,
                        positionY: 141,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'Woly7CQBAkkGpe3A21lXoz',
                        name: 'Category',
                        description: '',
                        positionX: -143,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'DOj4MO3NnhgCDKllZnxDWT',
                        name: 'Time',
                        description: '',
                        positionX: -408,
                        positionY: -108,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'Liv4abswHyIMx4kJz6dTFo',
                        name: 'Idea',
                        description: '',
                        positionX: -412,
                        positionY: 278,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'yFZAcQT3sWkhyH0zB80nzH',
                        name: 'Idea',
                        description: '',
                        positionX: -140,
                        positionY: -3,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '9bPFthPRyPtvfXKti5Qtfo',
                        name:
                            'Review Queue',
                        description: '',
                        positionX: 188,
                        positionY: -7,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'bNGKd3eRcKynXWfJRLPlx1',
                        name:
                            'Approval Detail',
                        description: '',
                        positionX: 450,
                        positionY: 81,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'Bxkqmeb8izINPj8fmDFh0s',
                        name:
                            'Ideas approve',
                        description: '',
                        positionX: 143,
                        positionY: 274,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'IwXZhOjZKETjhF6g9OJmeQ',
                        name:
                            'Approval Detail',
                        description: '',
                        positionX: 448,
                        positionY: 214,
                        isStart: false,
                        isComplete: false,
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
                        name: 'Start',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: true,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'M3HcytVGj8JNjrFS0AyVfA',
                        name: 'Draft',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'T6I6dn4MKD50QZXlvxIm9I',
                        name: 'Submit',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'OHPERFEO1EMfDoGZnccF5F',
                        name: 'Triage',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'NHIpcNdKKV4gbT4QOkkXEO',
                        name: 'Quick Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '4z9uXoChh9HjMTEHfZQhAk',
                        name: 'Standard Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'zO7tsd7ndwm2uQDwS30EzR',
                        name: 'Deep Review',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '32hICE8mCh9Ch0CMYyjEXR',
                        name: 'Panel A',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'WwjEFe4v1am6etJDQqg0mi',
                        name: 'Panel B',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'PU9ueWLOmK247RFNDwuh4R',
                        name: 'Panel C',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'ybr0XraIXnlbOhYRmBnkz6',
                        name: 'Panel D',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'qSJo6DFKY52Y0815TFax01',
                        name: 'Consolidate',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'rWdJ5vz4hm9dLVhBYROSoK',
                        name: 'Decision',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '4zi5yzNsiA89SzrcEityhr',
                        name: 'Approved',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '8yXx35sqhjAb3lfkSWbsG2',
                        name: 'Revise',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: 'HJBEhUvJ4rA9x8y3s2iVKZ',
                        name: 'Rejected',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: false,
                        fields: [],
                    },
                    {
                        id: '9r0eSQ4ndyaRoYbKTTDpW2',
                        name: 'End',
                        description: '',
                        positionX: 0,
                        positionY: 0,
                        isStart: false,
                        isComplete: true,
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
    const woUserSarah =
        'LhfaUUf4IumVsCSGB4xjdK';
    const woUserMike =
        'bLP3X1hb1mSz8gY9neogU3';
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
    ];

    const mockWoTransitions:
        WorkOrderTransitionEntity[] = [
        {
            id: 'wot-01-' + woId,
            work_order_id: woId,
            from_node_id: '',
            to_node_id: woNodeNew,
            user_id: woUserSarah,
            transitioned_at:
                woCreated,
        },
        {
            id: 'wot-02-' + woId,
            work_order_id: woId,
            from_node_id: woNodeNew,
            to_node_id: woNodeCapture,
            user_id: woUserSarah,
            transitioned_at:
                woCreated,
        },
        {
            id: 'wot-03-' + woId,
            work_order_id: woId,
            from_node_id:
                woNodeCapture,
            to_node_id: woNodeReview,
            user_id: woUserMike,
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
            user_id: woUserSarah,
            transitioned_at:
                dt(12, 9, 15),
        },
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
    ];

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

    const teams: {
        id: string;
        project_id: string;
        user_id: string;
        role: string;
        type: string;
    }[] = [
        {
            id: 'XARaNl9lkkoEoyGA31GeiR',
            project_id: 'u6YkHhlGc91oDMkr3x0isa',
            user_id: 'LhfaUUf4IumVsCSGB4xjdK',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'qOzPKSg2EAYWZpBlnRIVec',
            project_id: 'u6YkHhlGc91oDMkr3x0isa',
            user_id: 'bLP3X1hb1mSz8gY9neogU3',
            role: 'ML Engineer',
            type: 'engineering',
        },
        {
            id: '5uWbMZKZDKs951Zl0qA7IA',
            project_id: 'u6YkHhlGc91oDMkr3x0isa',
            user_id: 'zyTbfbjcGEfbpCsNTP0XjX',
            role: 'Data Scientist',
            type: 'engineering',
        },
        {
            id: 'JjEKNqt7EDSkhj0gHnMFnj',
            project_id: 'u6YkHhlGc91oDMkr3x0isa',
            user_id: '6xBfK5If82JKfThXb1wlzS',
            role: 'Backend Developer',
            type: 'engineering',
        },
        {
            id: 'wn3gLT5QSvsaQUKrXWucAF',
            project_id: 'jRE2Tj32NHsFGZIeEADp0p',
            user_id: 'bLP3X1hb1mSz8gY9neogU3',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'gXbBsrFFPTNdg6J0ykx1ou',
            project_id: 'YXUxtljJj6ebsQEFZ5nSI1',
            user_id: '53J8h9dr76XFqCjYcNVwIR',
            role: 'lead',
            type: 'business',
        },
        {
            id: '4mPPt7wT0Qq10gQwTYxGq2',
            project_id: 'sf1hZEIvey6seX1fbUwXMq',
            user_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            role: 'lead',
            type: 'business',
        },
        {
            id: 'TT2kiaUOSCGnF1zgT0jvmf',
            project_id: 'efwJPwQFljYHZYMuhetyow',
            user_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            role: 'lead',
            type: 'business',
        },
        {
            id: '5No60FKBCvuB0F5osnsM3U',
            project_id: 'zzcBNqWXtKs6kt7ggcRndY',
            user_id: 'zyTbfbjcGEfbpCsNTP0XjX',
            role: 'lead',
            type: 'business',
        },
    ];
    await Promise.all([
        ...teams.map(tm =>
            adapter.teams.put(
                tm.id,
                {
                    role: tm.role,
                    type: tm.type,
                },
            ),
        ),
        ...teams.map(tm =>
            adapter.teamProjects
                .put(`tmp-${tm.id}`, {
                    team_id:
                        tm.id,
                    project_id:
                        tm.project_id,
                    created_at: dt(75, 9, 0),
                }),
        ),
        ...teams.map(tm =>
            adapter.teamUsers
                .put(`tmu-${tm.id}`, {
                    team_id:
                        tm.id,
                    user_id: tm.user_id,
                    created_at: dt(75, 9, 0),
                }),
        ),
    ]);

    const ideaSubmissions:
        IdeaSubmissionEntity[] = [
        {
            id: 'k4dY2dPq90mQVwwCkhWIo3',
            idea_id: 'eT5xdKjzLDmuRn3r7XMX4R',
            user_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(75, 9, 30),
        },
        {
            id: 'XC7hsfNJueKQ8q0UfCuC7o',
            idea_id: 'cbTuSs0Ex84PeFGSvoAEFZ',
            user_id: 'bLP3X1hb1mSz8gY9neogU3',
            created_at: dt(70, 9, 0),
        },
        {
            id: 'YmzT46BbGVFALpiXFDnlVd',
            idea_id: 'wuCMQqo4IkEksx7MYmu8g2',
            user_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(65, 9, 0),
        },
        {
            id: 'cmoTu4GRGmO8y5QrfPIHSm',
            idea_id: 'ojOEXtdzdtTZtpM81TxVca',
            user_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            created_at: dt(55, 9, 0),
        },
        {
            id: 'kIUtvgTOLPjsSmAEVOhPb1',
            idea_id: 'T2vAafLDcshDONlYxpzPLc',
            user_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            created_at: dt(50, 9, 0),
        },
        {
            id: 'r04u9qpJKSyNjP9Owxr5Be',
            idea_id: 'HRYrImq1rBJ5ZRe1T9TAVk',
            user_id: 'zyTbfbjcGEfbpCsNTP0XjX',
            created_at: dt(45, 9, 0),
        },
        {
            id: '2mPJTlujj1RF6gexFwbDqJ',
            idea_id: 'MCxK0hzT9CPjJx1ZV5unfr',
            user_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(75, 10, 0),
        },
        {
            id: 'caBSqTgzDnvP8joamAG9OG',
            idea_id: 'SUb4gKXsZ1OsEauzqszg0t',
            user_id: 'WxQn4LVWb76YkmqK5B0EPp',
            created_at: dt(35, 9, 0),
        },
        {
            id: 'UfsCp7WYUybhwxD170okb4',
            idea_id: 'gxa84W9KvEgD0wT1F4TOM9',
            user_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(30, 9, 0),
        },
        {
            id: 'mbTZAQbC5cJSEIzhEEFpyq',
            idea_id: '1Z68gROMrlTAfPEGiyJJAY',
            user_id: 'jBoWiyWxj7pp4sG3JgX5l2',
            created_at: dt(25, 9, 0),
        },
        {
            id: '0LjTHFflWNaDZkKDqxmwJi',
            idea_id: 'Q2On2xwMpFdzOklBQJXrni',
            user_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            created_at: dt(20, 9, 0),
        },
    ];

    const activityActors:
        ActivityActorEntity[] = [
        {
            id: 'b46Mr8QWIMo4EDBxxhfkWL',
            activity_id: 'Ng6GWmx7DNmLsGshK3lBfU',
            user_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(0, 17, 50),
        },
        {
            id: 'pgyIzpoLgG8Vv6FgYF4DV8',
            activity_id: 'p3H9tGtQwFwQXpUiYyinT6',
            user_id: 'WxQn4LVWb76YkmqK5B0EPp',
            created_at: dt(0, 17, 35),
        },
        {
            id: 'SJalTSor6JhpoPincDXLeY',
            activity_id: '5PGE1WlEOTkSaNYjiBXLMA',
            user_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(0, 17, 0),
        },
        {
            id: 'JvodSYYA6w1ithWEirfNVg',
            activity_id: 'fOqTfg9JPs73xsnC4QUmHs',
            user_id: '6xBfK5If82JKfThXb1wlzS',
            created_at: dt(0, 16, 0),
        },
        {
            id: 'BExIeH5NDiGVGQnrP8phOs',
            activity_id: '3pBQbQp4LPK2udgd21HlTm',
            user_id: 'I5ntELi16X3N3JYCCnxMjZ',
            created_at: dt(0, 15, 0),
        },
        {
            id: 'pC3hoLmzaVyxJSGOHsmV5j',
            activity_id: 'CqXHcyiDNzFVcoUM2M1Tl3',
            user_id: 'Trf1Up2jMsPhEnjbW4Ji1n',
            created_at: dt(0, 14, 0),
        },
        {
            id: 'PsG42X7oevXgC5DRy4irTW',
            activity_id: 'Kj75MtFxnEpFZs4MSK1emd',
            user_id: 'oU0bIe0eUC33mTbZrxdogC',
            created_at: dt(0, 13, 0),
        },
        {
            id: 'bPgxi8YCw4yTFctLef62gB',
            activity_id: 'xRmfZFNV8GYDQmq8j09Fsc',
            user_id: 'LhfaUUf4IumVsCSGB4xjdK',
            created_at: dt(0, 12, 0),
        },
        {
            id: '2dp7FPj4gjWYtfR78D3wI2',
            activity_id: 'hP80lUSXqn1PSleymgE3Ks',
            user_id: '53J8h9dr76XFqCjYcNVwIR',
            created_at: dt(1, 18, 0),
        },
        {
            id: 'Rf5G2Dh1ejnvzxbpW6hcrm',
            activity_id: 'XMltAG0dpolQLDTfd5GLWj',
            user_id: 'WxQn4LVWb76YkmqK5B0EPp',
            created_at: dt(1, 15, 0),
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
    ]);
}

export async function populateBootstrapData(
    adapter: DbAdapter,
): Promise<void> {
    await Promise.all([
        adapter.users.put('current', {
            first_name: 'Tony',
            last_name: 'Stark',
            email: 'demo@example.com',
            role: 'Admin',
            department: 'Product',
            status: 'active' as UserStatus,
            availability: 100,
            performance_score: 95,
            projects_completed: 20,
            current_projects: 5,
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
            last_active: dt(0, 18, 0),
        }),
        adapter.company.put({
            name: 'Stark Industries',
            domain: 'acmecorp.com',
        }),
        adapter.organization.put({
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
            active_users: 14,
        }),
    ]);
}
